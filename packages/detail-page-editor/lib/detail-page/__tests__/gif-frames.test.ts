import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeAnimation } from "../gif-frames";

/**
 * WebP 디코드가 **트랙 메타데이터를 기다리는지** 지킨다.
 *
 * ``ImageDecoder`` 에서 프레임 수를 알려주는 약속은 ``tracks.ready`` 하나뿐인데,
 * ``completed`` 만 기다려도 에러 없이 진행돼 ``selectedTrack`` 이 null 로 읽힌다.
 * 그러면 움직이는 WebP 가 한 장짜리로 나와 편집기에서 멈추고 내보내기도 정지 이미지가
 * 되는데, 실패가 아니라서 아무 신호가 없다. 그래서 가짜 디코더도 진짜 Chrome 과 같은
 * 순서로 — ``tracks.ready`` 전에는 ``selectedTrack`` 이 null 이도록 — 흉내 낸다.
 */

/** "RIFF" + size + "WEBP" 헤더만 갖춘 최소 버퍼(스니퍼가 webp 로 읽으면 충분). */
function webpBuffer(): ArrayBuffer {
  const bytes = new Uint8Array(16);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  return bytes.buffer;
}

function fakeVideoFrame(durationUs: number | null) {
  return {
    displayWidth: 8,
    displayHeight: 8,
    duration: durationUs,
    close: vi.fn(),
  };
}

/** ``tracks.ready`` 가 resolve 되기 전에는 트랙이 없는, Chrome 과 같은 모양의 디코더. */
function installFakeDecoder(frameCount: number) {
  const decoded: number[] = [];
  class FakeImageDecoder {
    completed = Promise.resolve();
    tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null } = {
      ready: Promise.resolve().then(() => {
        this.tracks.selectedTrack = { frameCount };
      }),
      selectedTrack: null,
    };
    async decode({ frameIndex }: { frameIndex: number }) {
      decoded.push(frameIndex);
      return { image: fakeVideoFrame(120_000) };
    }
    close = vi.fn();
  }
  (globalThis as { ImageDecoder?: unknown }).ImageDecoder = FakeImageDecoder;
  return decoded;
}

/** jsdom 의 진짜 2D 컨텍스트는 가짜 VideoFrame 을 거부한다 — 그리기만 무해하게 막는다. */
function stubCanvas2d() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
}

describe("decodeAnimation (webp)", () => {
  afterEach(() => {
    delete (globalThis as { ImageDecoder?: unknown }).ImageDecoder;
    vi.restoreAllMocks();
  });

  it("tracks.ready를 기다려 모든 프레임을 꺼낸다(한 장으로 접히지 않는다)", async () => {
    stubCanvas2d();
    const decoded = installFakeDecoder(4);

    const animation = await decodeAnimation(webpBuffer());

    expect(decoded).toEqual([0, 1, 2, 3]);
    expect(animation.frames).toHaveLength(4);
    expect(animation.durationMs).toBe(480);
  });

  it("한 장짜리 WebP는 그대로 한 장", async () => {
    stubCanvas2d();
    installFakeDecoder(1);

    const animation = await decodeAnimation(webpBuffer());

    expect(animation.frames).toHaveLength(1);
  });
});
