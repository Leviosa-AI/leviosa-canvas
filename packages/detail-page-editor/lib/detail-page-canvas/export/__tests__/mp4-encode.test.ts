/**
 * 브라우저 H.264 인코딩.
 *
 * WebCodecs 는 jsdom 에 없으므로 인코더·muxer 를 세워 두고 **무엇을 건네는지**를
 * 본다. 여기서 잡으려는 건 눈으로는 안 보이고 파일에서만 드러나는 것들이다 —
 * 마이크로초 타임스탬프(밀리초를 넣으면 1000배 느린 영상), yuv420p 가 요구하는 짝수
 * 크기, 프레임 해제, 키프레임.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addVideoChunk = vi.fn();
const finalize = vi.fn();
const muxerOptions = vi.fn();

vi.mock("mp4-muxer", () => ({
  ArrayBufferTarget: class {
    buffer = new ArrayBuffer(8);
  },
  Muxer: class {
    target: { buffer: ArrayBuffer };
    constructor(options: { target: { buffer: ArrayBuffer } }) {
      muxerOptions(options);
      this.target = options.target;
    }
    addVideoChunk = addVideoChunk;
    finalize = finalize;
  },
}));

import { encodeFramesAsMp4 } from "../mp4-encode";
import { isMp4EncodeSupported } from "../mp4-support";

type EncodeCall = { timestamp: number; duration: number; keyFrame: boolean; closed: boolean };

const encodeCalls: EncodeCall[] = [];
const configureCalls: Array<Record<string, unknown>> = [];

class FakeVideoFrame {
  timestamp: number;
  duration: number;
  closed = false;
  constructor(_source: unknown, init: { timestamp: number; duration: number }) {
    this.timestamp = init.timestamp;
    this.duration = init.duration;
  }
  close() {
    this.closed = true;
  }
}

class FakeVideoEncoder {
  state = "unconfigured";
  static isConfigSupported = vi.fn(async (_config: { codec: string }) => ({
    supported: true,
  }));
  constructor(_init: unknown) {}
  configure(config: Record<string, unknown>) {
    configureCalls.push(config);
    this.state = "configured";
  }
  encode(frame: FakeVideoFrame, options?: { keyFrame?: boolean }) {
    encodeCalls.push({
      timestamp: frame.timestamp,
      duration: frame.duration,
      keyFrame: Boolean(options?.keyFrame),
      // encode 시점에 이미 닫혀 있으면 안 된다 — 닫기는 encode 뒤여야 한다.
      closed: frame.closed,
    });
  }
  async flush() {}
  close() {
    this.state = "closed";
  }
}

/** 빈 캔버스. 크기만 의미가 있다. */
function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

beforeEach(() => {
  encodeCalls.length = 0;
  configureCalls.length = 0;
  addVideoChunk.mockClear();
  finalize.mockClear();
  muxerOptions.mockClear();
  FakeVideoEncoder.isConfigSupported.mockClear();
  FakeVideoEncoder.isConfigSupported.mockImplementation(async () => ({ supported: true }));
  vi.stubGlobal("VideoEncoder", FakeVideoEncoder);
  vi.stubGlobal("VideoFrame", FakeVideoFrame);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isMp4EncodeSupported", () => {
  it("WebCodecs 가 있으면 참", () => {
    expect(isMp4EncodeSupported()).toBe(true);
  });

  it("인코더가 없는 브라우저에서는 거짓", () => {
    vi.stubGlobal("VideoEncoder", undefined);
    expect(isMp4EncodeSupported()).toBe(false);
  });
});

describe("encodeFramesAsMp4", () => {
  it("타임스탬프를 마이크로초로 넣는다", async () => {
    // 100ms 간격이면 두 번째 프레임은 100_000 마이크로초여야 한다. 밀리초를 그대로
    // 넣으면 100 이 되고, 영상이 1000배 느려진다.
    await encodeFramesAsMp4([canvasOf(64, 64), canvasOf(64, 64), canvasOf(64, 64)], 100);

    expect(encodeCalls.map((c) => c.timestamp)).toEqual([0, 100_000, 200_000]);
    expect(encodeCalls[0].duration).toBe(100_000);
  });

  it("홀수 크기를 짝수로 내린다 — yuv420p 가 홀수를 못 받는다", async () => {
    await encodeFramesAsMp4([canvasOf(101, 65)], 100);

    expect(configureCalls[0]).toMatchObject({ width: 100, height: 64 });
    expect(muxerOptions.mock.calls[0][0].video).toMatchObject({ width: 100, height: 64 });
  });

  it("짝수 크기는 건드리지 않는다", async () => {
    await encodeFramesAsMp4([canvasOf(100, 64)], 100);

    expect(configureCalls[0]).toMatchObject({ width: 100, height: 64 });
  });

  it("첫 프레임은 키프레임이라 앞으로 감기가 된다", async () => {
    await encodeFramesAsMp4([canvasOf(64, 64), canvasOf(64, 64)], 100);

    expect(encodeCalls[0].keyFrame).toBe(true);
  });

  it("프레임은 encode 뒤에 닫는다 — 안 닫으면 프레임 수만큼 메모리를 문다", async () => {
    await encodeFramesAsMp4([canvasOf(64, 64), canvasOf(64, 64)], 100);

    expect(encodeCalls.every((c) => c.closed)).toBe(false);
  });

  it("moov 를 앞에 두어 다 받기 전에도 재생이 시작된다", async () => {
    await encodeFramesAsMp4([canvasOf(64, 64)], 100);

    expect(muxerOptions.mock.calls[0][0].fastStart).toBe("in-memory");
    expect(finalize).toHaveBeenCalledTimes(1);
  });

  it("크기를 받아 주는 코덱을 찾을 때까지 후보를 내려간다", async () => {
    FakeVideoEncoder.isConfigSupported.mockImplementation(async (config) => ({
      supported: config.codec === "avc1.42001f",
    }));

    await encodeFramesAsMp4([canvasOf(64, 64)], 100);

    expect(configureCalls[0]).toMatchObject({ codec: "avc1.42001f" });
  });

  it("어떤 후보도 못 쓰면 내보내기를 시작하지 않는다", async () => {
    FakeVideoEncoder.isConfigSupported.mockImplementation(async () => ({ supported: false }));

    await expect(encodeFramesAsMp4([canvasOf(64, 64)], 100)).rejects.toThrow(
      "MP4_ENCODE_UNSUPPORTED",
    );
    expect(finalize).not.toHaveBeenCalled();
  });

  it("WebCodecs 가 없는 브라우저에서는 분명히 거절한다", async () => {
    vi.stubGlobal("VideoEncoder", undefined);

    await expect(encodeFramesAsMp4([canvasOf(64, 64)], 100)).rejects.toThrow(
      "MP4_ENCODE_UNSUPPORTED",
    );
  });

  it("중단 신호가 서 있으면 그 자리에서 멈춘다", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      encodeFramesAsMp4([canvasOf(64, 64)], 100, controller.signal),
    ).rejects.toBeDefined();
    expect(encodeCalls).toHaveLength(0);
  });

  it("프레임이 없으면 빈 파일을 만들지 않는다", async () => {
    await expect(encodeFramesAsMp4([], 100)).rejects.toThrow("no frames");
  });

  it("video/mp4 블롭을 돌려준다", async () => {
    const blob = await encodeFramesAsMp4([canvasOf(64, 64)], 100);

    expect(blob.type).toBe("video/mp4");
  });
});
