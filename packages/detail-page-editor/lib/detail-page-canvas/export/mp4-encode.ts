/**
 * 합성 프레임 → H.264 MP4, 브라우저 안에서.
 *
 * WebP 와 정반대다. 움직이는 WebP 는 브라우저가 굽지 못해 서버로 보내지만, MP4 는
 * 브라우저가 `VideoEncoder` 로 진짜 H.264 를 뽑을 수 있어서 프레임이 페이지를 떠날
 * 이유가 없다. 서버로 옮기면 이미지에 ffmpeg 를 넣어야 하는데(우리가 쓰는 opencv
 * 휠은 리눅스에서 H.264 인코더가 빠져 있어 `avc1` 이 아예 안 열린다), 그렇게 얻는
 * 게 없다.
 *
 * `VideoEncoder` 는 청크만 뱉고 컨테이너는 만들지 않아서 mp4-muxer 로 감싼다.
 */

import { ArrayBufferTarget, Muxer } from "mp4-muxer";

import { isMp4EncodeSupported } from "./mp4-support";

/**
 * 시도해 볼 코덱 문자열. 뒤로 갈수록 낮은 레벨이다.
 *
 * 레벨은 해상도 상한을 뜻해서, 세로로 긴 섹션은 낮은 레벨에서 거절당한다. 그래서
 * 하나를 고정하지 않고 `isConfigSupported` 로 물어보며 내려간다. 전부 Baseline/High
 * 프로파일이라 어디서든 재생된다.
 */
const CODEC_CANDIDATES = [
  "avc1.640034", // High 5.2
  "avc1.42003c", // Baseline 6.0
  "avc1.420034", // Baseline 5.2
  "avc1.42002a", // Baseline 4.2
  "avc1.42001f", // Baseline 3.1
];

/** 화면에 담기는 화질 대비 파일이 커지지 않는 선. */
const BITS_PER_PIXEL_PER_SECOND = 0.12;
/** 앞으로 감기가 되도록 키프레임을 이 간격으로 박는다. */
const KEYFRAME_INTERVAL_SEC = 2;

/**
 * yuv420p 는 가로·세로가 짝수여야 한다. 홀수면 인코더가 거절하거나 한 줄이 뭉개져서,
 * 짝수로 내린 크기에 맞춰 다시 그린다(잘리는 건 최대 1픽셀).
 */
function toEvenSized(frame: HTMLCanvasElement): HTMLCanvasElement {
  const width = frame.width - (frame.width % 2);
  const height = frame.height - (frame.height % 2);
  if (width === frame.width && height === frame.height) return frame;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(frame, 0, 0);
  return canvas;
}

/**
 * 영상에는 알파가 없다. 투명한 채로 넘기면 인코더가 검게 깔아서, 흰 바탕에 얹는다 —
 * 상세페이지가 실제로 놓이는 바탕색이다.
 */
function flattenOnWhite(frame: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(frame, 0, 0);
  return canvas;
}

/** 이 크기를 받아 주는 첫 코덱. 전부 거절하면 null. */
async function pickCodec(
  width: number,
  height: number,
  framerate: number,
  bitrate: number,
): Promise<string | null> {
  for (const codec of CODEC_CANDIDATES) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        framerate,
        bitrate,
      });
      if (support.supported) return codec;
    } catch {
      // 이 코덱 문자열 자체를 모르는 브라우저 — 다음 후보로 넘어간다.
    }
  }
  return null;
}

/**
 * 합성 프레임을 H.264 MP4 로 굽는다.
 *
 * `fastStart: "in-memory"` 로 moov 를 앞에 둔다 — 뒤에 있으면 올린 곳에서 파일을 다
 * 받기 전엔 재생을 시작하지 못한다.
 */
export async function encodeFramesAsMp4(
  frames: HTMLCanvasElement[],
  delayMs: number,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!isMp4EncodeSupported()) {
    throw new Error("MP4_ENCODE_UNSUPPORTED");
  }
  if (frames.length === 0) throw new Error("no frames to encode");

  const prepared = frames.map((frame) => flattenOnWhite(toEvenSized(frame)));
  const { width, height } = prepared[0];
  if (width === 0 || height === 0) throw new Error("frame too small to encode");

  const fps = Math.max(1, Math.round(1000 / Math.max(1, delayMs)));
  const bitrate = Math.round(width * height * fps * BITS_PER_PIXEL_PER_SECOND);
  const codec = await pickCodec(width, height, fps, bitrate);
  if (!codec) throw new Error("MP4_ENCODE_UNSUPPORTED");

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height, frameRate: fps },
    fastStart: "in-memory",
  });

  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => {
      failure = error instanceof Error ? error : new Error(String(error));
    },
  });
  encoder.configure({ codec, width, height, framerate: fps, bitrate });

  const frameDurationUs = Math.round(delayMs * 1000);
  const keyEvery = Math.max(1, Math.round(fps * KEYFRAME_INTERVAL_SEC));
  try {
    for (let i = 0; i < prepared.length; i++) {
      if (signal?.aborted) throw signal.reason ?? new Error("aborted");
      if (failure) throw failure;
      // 타임스탬프는 마이크로초다. 밀리초를 그대로 넣으면 1000배 느린 영상이 나온다.
      const videoFrame = new VideoFrame(prepared[i], {
        timestamp: i * frameDurationUs,
        duration: frameDurationUs,
      });
      try {
        encoder.encode(videoFrame, { keyFrame: i % keyEvery === 0 });
      } finally {
        // VideoFrame 은 GC 를 기다리지 않는다 — 안 닫으면 프레임 수만큼 메모리를 문다.
        videoFrame.close();
      }
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }

  muxer.finalize();
  return new Blob([muxer.target.buffer as ArrayBuffer], { type: "video/mp4" });
}
