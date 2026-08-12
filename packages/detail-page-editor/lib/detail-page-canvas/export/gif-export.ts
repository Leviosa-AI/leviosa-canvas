/**
 * Animation-aware raster export: builds a ZIP where contiguous still sections
 * are stacked into PNGs and every animated section is encoded as its own
 * animated WebP (default) or GIF.
 *
 * An animated section is rendered by driving each source animation element
 * frame-by-frame (swap ``src`` → ``store.toDataURL`` composites background +
 * text + that frame) across a shared timeline. **That composition step is the
 * same for both formats** — only the final encode differs:
 *
 * - **WebP** posts the composed frames to the server. Browsers cannot encode
 *   animated WebP at all (``canvas.toBlob`` gives one still, WebCodecs
 *   ``VideoEncoder`` gives video, not WebP), so this is the one step we cannot
 *   keep client-side. See ``docs/detail_page_animated_webp_plan.md`` in the
 *   server repo.
 * - **GIF** quantizes to one global palette and encodes here via ``gifenc``, so
 *   picking GIF keeps the export fully offline.
 * - **MP4** encodes here too, via WebCodecs ``VideoEncoder`` + an MP4 muxer.
 *   ``mp4-encode.ts`` is dynamic-imported so browsers that never pick MP4 do not
 *   pay for the muxer.
 *
 * Heavy deps (gifenc, jszip, gifuct) live here and this module is
 * dynamic-imported from the download dialog only when an animation is present.
 */

import { applyPalette, GIFEncoder, quantize } from "gifenc";

import type { DetailPageHost } from "../../../components/detail-page/detail-page-host-context";

import {
  decodeAnimation,
  frameAtTime,
  type DecodedAnimation,
  type DecodedFrame,
} from "../../detail-page/gif-frames";
import { buildGifTimeline } from "../../detail-page/gif-timeline";
import { isGifSrc, planGifExport } from "./gif-plan";

/** Cap GIF output width — a full-res 4× animated section would be many MB. */
export const MAX_GIF_WIDTH = 512;
/**
 * MP4 gets a wider cap than GIF/WebP. That 512 is a *transfer* limit: GIF pays
 * for every pixel in a palette-coded frame, and WebP frames travel to the server
 * as PNG under an upload cap. MP4 is encoded right here by a hardware H.264
 * encoder that eats resolution cheaply, so holding it at 512 would only make the
 * video soft on a ~860px-wide detail page for no gain.
 */
export const MAX_MP4_WIDTH = 1080;
/** Palette sampling stride across frames to keep quantize input bounded. */
const PALETTE_SAMPLE_PIXELS = 60_000;

type ElementLike = {
  id?: string;
  type?: string;
  src?: string;
  custom?: Record<string, unknown> | null;
  children?: ElementLike[];
  set: (patch: Record<string, unknown>) => void;
};
type PageLike = {
  id: string;
  computedWidth: number;
  computedHeight: number;
  children: ElementLike[];
};
type StoreLike = {
  pages: PageLike[];
  toDataURL: (opts: { pageId?: string; pixelRatio?: number; mimeType?: string }) => Promise<string>;
  waitLoading?: () => Promise<void>;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

function collectGifElements(children: ElementLike[], out: ElementLike[]): void {
  for (const el of children ?? []) {
    const tagged = el.custom && (el.custom as { detailPageGif?: unknown }).detailPageGif;
    if (tagged || ((el.type === "image" || el.type === "svg") && isGifSrc(el.src))) {
      out.push(el);
    }
    if (el.children) collectGifElements(el.children, out);
  }
}

function drawToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")?.drawImage(img, 0, 0);
  return canvas;
}

function imageDataOf(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Build one global 256-color palette from a strided sample across all composed
 * frames, so a section that barely changes reuses colors instead of paying a
 * per-frame local color table.
 */
function buildGlobalPalette(frames: HTMLCanvasElement[]): number[][] {
  const perFrame = Math.max(1, Math.floor(PALETTE_SAMPLE_PIXELS / frames.length));
  const sample = new Uint8Array(frames.length * perFrame * 4);
  let o = 0;
  for (const frame of frames) {
    const data = imageDataOf(frame).data;
    const stride = Math.max(4, Math.floor(data.length / 4 / perFrame) * 4);
    for (let i = 0; i < data.length && o < sample.length - 4; i += stride) {
      sample[o++] = data[i];
      sample[o++] = data[i + 1];
      sample[o++] = data[i + 2];
      sample[o++] = data[i + 3];
    }
  }
  return quantize(sample.subarray(0, o), 256, { format: "rgb444" });
}

/** Output format for an animated section. WebP is the default. */
export type AnimationFormat = "webp" | "gif" | "mp4";

/** Turn a canvas into a PNG Blob — the wire format for server-side encoding. */
function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas toBlob failed"))),
      "image/png",
    );
  });
}

/** Encode composed frames as an animated GIF, entirely in the browser. */
function encodeFramesAsGif(frames: HTMLCanvasElement[], delayMs: number): Blob {
  const palette = buildGlobalPalette(frames);
  const encoder = GIFEncoder();
  const delay = Math.round(delayMs);
  for (const frame of frames) {
    const { data, width, height } = imageDataOf(frame);
    const index = applyPalette(data, palette, "rgb444");
    encoder.writeFrame(index, width, height, { palette, delay });
  }
  encoder.finish();
  return new Blob([encoder.bytes() as unknown as Uint8Array<ArrayBuffer>], {
    type: "image/gif",
  });
}

/**
 * Encode composed frames as an animated WebP.
 *
 * The round trip is not an optimisation choice — no browser can encode animated
 * WebP, so the frames have to leave the page. They go as lossless PNG so the
 * server compresses the original pixels once rather than compounding losses.
 */
async function encodeFramesAsWebp(
  host: DetailPageHost,
  frames: HTMLCanvasElement[],
  delayMs: number,
  signal?: AbortSignal,
): Promise<Blob> {
  const payload = await Promise.all(frames.map(canvasToPngBlob));
  const fps = Math.max(1, Math.round(1000 / Math.max(1, delayMs)));
  return host.api.encodeDetailPageAnimation(payload, { fps, format: "webp" }, signal);
}

/** Render a single animated section to an animated WebP (default) or GIF Blob. */
export async function encodeSectionGif(
  store: unknown,
  pageId: string,
  /** WebP 인코딩은 서버가 한다 — 브라우저에 애니메이션 WebP 인코더가 없다. */
  host: DetailPageHost,
  format: AnimationFormat = "webp",
  signal?: AbortSignal,
): Promise<Blob> {
  const s = store as StoreLike;
  const page = s.pages.find((p) => p.id === pageId);
  if (!page) throw new Error(`page not found: ${pageId}`);

  const gifEls: ElementLike[] = [];
  collectGifElements(page.children, gifEls);
  if (gifEls.length === 0) throw new Error("no GIF element on page");

  // Decode each source GIF and remember its original src to restore later.
  const decoded = new Map<ElementLike, DecodedAnimation>();
  const original = new Map<ElementLike, string | undefined>();
  for (const el of gifEls) {
    original.set(el, el.src);
    if (el.src) decoded.set(el, await decodeAnimation(el.src));
  }

  const timeline = buildGifTimeline([...decoded.values()].map((g) => g.durationMs));
  const maxWidth = format === "mp4" ? MAX_MP4_WIDTH : MAX_GIF_WIDTH;
  const ratio = Math.min(1, maxWidth / Math.max(1, page.computedWidth));
  const frameSrcCache = new WeakMap<DecodedFrame, string>();
  const frameSrc = (frame: DecodedFrame): string => {
    let url = frameSrcCache.get(frame);
    if (!url) {
      url = frame.canvas.toDataURL("image/png");
      frameSrcCache.set(frame, url);
    }
    return url;
  };

  const composed: HTMLCanvasElement[] = [];
  try {
    for (const t of timeline.times) {
      for (const el of gifEls) {
        const gif = decoded.get(el);
        if (gif) el.set({ src: frameSrc(frameAtTime(gif, t)) });
      }
      await s.waitLoading?.();
      const url = await s.toDataURL({ pageId, pixelRatio: ratio, mimeType: "image/png" });
      composed.push(drawToCanvas(await loadImage(url)));
    }
  } finally {
    for (const el of gifEls) el.set({ src: original.get(el) ?? "" });
    await s.waitLoading?.();
  }

  if (format === "gif") return encodeFramesAsGif(composed, timeline.frameDelayMs);
  if (format === "mp4") {
    const { encodeFramesAsMp4 } = await import("./mp4-encode");
    return encodeFramesAsMp4(composed, timeline.frameDelayMs, signal);
  }
  return encodeFramesAsWebp(host, composed, timeline.frameDelayMs, signal);
}

/** Stack the given selected-page indices into one vertical PNG/JPG Blob. */
async function stackPngRun(
  store: StoreLike,
  pageIds: string[],
  indices: number[],
  pixelRatio: number,
  mimeType: string,
): Promise<Blob> {
  const urls: string[] = [];
  for (const i of indices) {
    urls.push(await store.toDataURL({ pageId: pageIds[i], pixelRatio, mimeType }));
  }
  const images = await Promise.all(urls.map(loadImage));
  const width = Math.max(...images.map((img) => img.width));
  const height = images.reduce((acc, img) => acc + img.height, 0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  if (mimeType === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  let y = 0;
  for (const img of images) {
    ctx.drawImage(img, 0, y);
    y += img.height;
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, 0.95));
  if (!blob) throw new Error("canvas toBlob failed");
  return blob;
}

export type GifZipOptions = {
  pageIds: string[];
  gifFlags: boolean[];
  pixelRatio: number;
  mimeType: string;
  ext: string;
  /** Animated section format. Defaults to WebP. */
  animationFormat?: AnimationFormat;
  /** Optional progress callback: (done, total) units. */
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  /** 소싱 서버 접근(애니메이션 WebP 인코딩). */
  host: DetailPageHost;
};

/**
 * Build the full ZIP for a document that contains at least one animated
 * section. Contiguous still sections stack into one ``label.ext`` PNG/JPG; each
 * animated section is a standalone ``label.webp`` (or ``.gif``).
 */
export async function exportGifZip(store: unknown, opts: GifZipOptions): Promise<Blob> {
  const s = store as StoreLike;
  const units = planGifExport(opts.gifFlags);
  const animationFormat = opts.animationFormat ?? "webp";
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  let done = 0;
  for (const unit of units) {
    if (unit.kind === "gif") {
      zip.file(
        `${unit.label}.${animationFormat}`,
        await encodeSectionGif(s, opts.pageIds[unit.page], opts.host, animationFormat, opts.signal),
      );
    } else {
      const blob = await stackPngRun(s, opts.pageIds, unit.pages, opts.pixelRatio, opts.mimeType);
      zip.file(`${unit.label}.${opts.ext}`, blob);
    }
    opts.onProgress?.(++done, units.length);
  }
  return zip.generateAsync({ type: "blob" });
}
