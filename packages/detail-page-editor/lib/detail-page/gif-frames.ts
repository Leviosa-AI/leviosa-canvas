/**
 * Decode an animated image (WebP or GIF) into fully-composited RGBA frames.
 *
 * Two decoders, picked from the container magic rather than the URL — a
 * presigned S3 link carries no reliable extension, and ``.webp`` is shared by
 * still and animated files anyway.
 *
 * - **WebP** goes through WebCodecs ``ImageDecoder``, which hands back complete
 *   frames. Nothing to composite.
 * - **GIF** goes through gifuct-js, which hands back per-frame *patches* in the
 *   frame's own sub-rectangle, so we paint them onto a persistent full-size
 *   canvas honoring GIF disposal methods — otherwise frames that only redraw a
 *   changed region come out corrupt.
 *
 * Where ``ImageDecoder`` is missing (older Safari, Firefox) an animated WebP
 * decodes to its first frame and simply sits still. That is the same outcome as
 * a failed decode, and the caller already handles a one-frame result.
 *
 * Browser-only (needs canvas); import lazily from export glue.
 */

import { parseGIF, decompressFrames, type ParsedFrame } from "gifuct-js";

import { assetBytesUrl } from "./asset-bytes-url";
import { sniffAnimationType } from "./animation-sniff";

export type DecodedFrame = {
  /** Full-size composited frame, ready to draw. */
  canvas: HTMLCanvasElement;
  /** This frame's on-screen duration (ms), clamped to a sane minimum. */
  delayMs: number;
  /** Cumulative start time of this frame within the loop (ms). */
  timeMs: number;
};

export type DecodedAnimation = {
  width: number;
  height: number;
  durationMs: number;
  frames: DecodedFrame[];
};

/** Back-compat aliases — these were GIF-only names before WebP landed. */
export type DecodedGifFrame = DecodedFrame;
export type DecodedGif = DecodedAnimation;

/** GIF spec allows 0 delay; browsers floor it — mirror that so loops aren't instant. */
const MIN_DELAY_MS = 20;

async function fetchArrayBuffer(source: string | ArrayBuffer): Promise<ArrayBuffer> {
  if (source instanceof ArrayBuffer) return source;
  // 리다이렉트를 따라가면 CORS가 깨지는 주소가 있다 — assetBytesUrl 주석 참고.
  const res = await fetch(assetBytesUrl(source));
  if (!res.ok) throw new Error(`animation fetch failed: ${res.status}`);
  return res.arrayBuffer();
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  return canvas;
}

type ImageDecoderCtor = new (init: { data: ArrayBuffer; type: string }) => {
  completed: Promise<void>;
  tracks: { ready: Promise<void>; selectedTrack?: { frameCount: number } | null };
  decode: (opts: { frameIndex: number }) => Promise<{
    image: CanvasImageSource & { displayWidth: number; displayHeight: number; duration: number | null; close: () => void };
  }>;
  close: () => void;
};

function imageDecoderCtor(): ImageDecoderCtor | null {
  const ctor = (globalThis as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder;
  return typeof ctor === "function" ? ctor : null;
}

/** Draw the whole animation as a single still frame — the no-decoder fallback. */
async function decodeStill(buffer: ArrayBuffer, mime: string): Promise<DecodedAnimation> {
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("still decode failed"));
      el.src = url;
    });
    const canvas = makeCanvas(img.naturalWidth, img.naturalHeight);
    canvas.getContext("2d")?.drawImage(img, 0, 0);
    return {
      width: canvas.width,
      height: canvas.height,
      durationMs: 0,
      frames: [{ canvas, delayMs: MIN_DELAY_MS, timeMs: 0 }],
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeWebp(buffer: ArrayBuffer): Promise<DecodedAnimation> {
  const Ctor = imageDecoderCtor();
  if (!Ctor) return decodeStill(buffer, "image/webp");

  const decoder = new Ctor({ data: buffer, type: "image/webp" });
  try {
    // 트랙 메타데이터를 기다리는 약속은 ``tracks.ready`` 하나뿐이다. ``completed`` 만
    // 기다리면 ``selectedTrack`` 이 아직 **null** 이라 프레임 수가 1로 읽히고, 움직이는
    // WebP 가 통째로 정지 이미지가 된다 — 편집기에서 멈춰 보이고 내보내기도 한 장으로
    // 나갔던 원인이다(실측: Chrome 150 에서 4프레임 WebP 가 completed 뒤엔 null,
    // tracks.ready 뒤엔 4). 실패가 아니라서 아무 로그도 남지 않는다.
    await decoder.tracks.ready;
    await decoder.completed;
    const count = decoder.tracks.selectedTrack?.frameCount ?? 1;
    const frames: DecodedFrame[] = [];
    let timeMs = 0;
    let width = 0;
    let height = 0;

    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      try {
        width = width || image.displayWidth;
        height = height || image.displayHeight;
        const canvas = makeCanvas(image.displayWidth, image.displayHeight);
        canvas.getContext("2d")?.drawImage(image, 0, 0);
        // VideoFrame.duration is microseconds; a still track reports null.
        const delayMs = Math.max(MIN_DELAY_MS, Math.round((image.duration ?? 0) / 1000));
        frames.push({ canvas, delayMs, timeMs });
        timeMs += delayMs;
      } finally {
        image.close();
      }
    }
    if (!frames.length) return decodeStill(buffer, "image/webp");
    return { width, height, durationMs: timeMs, frames };
  } finally {
    decoder.close();
  }
}

function decodeGifBuffer(buffer: ArrayBuffer): DecodedAnimation {
  const parsed = parseGIF(buffer);
  const rawFrames = decompressFrames(parsed, true);
  const width = parsed.lsd.width;
  const height = parsed.lsd.height;

  // Persistent full-frame canvas we mutate patch-by-patch.
  const stage = makeCanvas(width, height);
  const stageCtx = stage.getContext("2d");
  if (!stageCtx) throw new Error("2d context unavailable");
  // Scratch canvas to turn a patch (RGBA) into something drawImage can place.
  const patchCanvas = makeCanvas(width, height);
  const patchCtx = patchCanvas.getContext("2d");
  if (!patchCtx) throw new Error("2d context unavailable");

  const frames: DecodedFrame[] = [];
  let timeMs = 0;
  let prevSnapshot: ImageData | null = null;
  let prevFrame: ParsedFrame | null = null;

  for (const frame of rawFrames) {
    // Apply the *previous* frame's disposal before drawing this one.
    if (prevFrame) {
      const d = prevFrame.disposalType;
      const { left, top, width: fw, height: fh } = prevFrame.dims;
      if (d === 2) stageCtx.clearRect(left, top, fw, fh);
      else if (d === 3 && prevSnapshot) stageCtx.putImageData(prevSnapshot, 0, 0);
    }
    if (frame.disposalType === 3) prevSnapshot = stageCtx.getImageData(0, 0, width, height);

    const { left, top, width: fw, height: fh } = frame.dims;
    const patch = new ImageData(new Uint8ClampedArray(frame.patch), fw, fh);
    patchCtx.clearRect(0, 0, width, height);
    patchCtx.putImageData(patch, left, top);
    stageCtx.drawImage(patchCanvas, 0, 0);

    const out = makeCanvas(width, height);
    out.getContext("2d")?.drawImage(stage, 0, 0);

    const delayMs = Math.max(MIN_DELAY_MS, frame.delay || 0);
    frames.push({ canvas: out, delayMs, timeMs });
    timeMs += delayMs;
    prevFrame = frame;
  }

  return { width, height, durationMs: timeMs, frames };
}

/** Decode an animated WebP or GIF into composited frames. */
export async function decodeAnimation(
  source: string | ArrayBuffer,
): Promise<DecodedAnimation> {
  const buffer = await fetchArrayBuffer(source);
  const kind = sniffAnimationType(buffer);
  if (kind === "webp") return decodeWebp(buffer);
  if (kind === "gif") return decodeGifBuffer(buffer);
  // Unknown container: it still may be something <img> can draw (PNG/JPEG).
  return decodeStill(buffer, "image/*");
}

/** @deprecated Use {@link decodeAnimation} — kept so older imports keep working. */
export const decodeGif = decodeAnimation;

/** The frame visible at time ``tMs`` within the loop (wraps on duration). */
export function frameAtTime(gif: DecodedAnimation, tMs: number): DecodedFrame {
  if (gif.frames.length <= 1 || gif.durationMs <= 0) return gif.frames[0];
  const t = ((tMs % gif.durationMs) + gif.durationMs) % gif.durationMs;
  // Linear scan is fine: frame counts are capped and small.
  for (let i = gif.frames.length - 1; i >= 0; i--) {
    if (t >= gif.frames[i].timeMs) return gif.frames[i];
  }
  return gif.frames[0];
}
