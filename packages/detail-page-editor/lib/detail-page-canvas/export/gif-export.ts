// 이 선언은 패키지가 들고 오지만, 소비자의 tsconfig 는 node_modules 안의 .d.ts 를 자동으로
// 집지 않는다. 프론트엔드에서는 같은 파일이 src/types 에 있어서 우연히 포함됐을 뿐이다.
// 여기서 직접 가리켜야 설치한 쪽에서도 타입이 선다.
/// <reference path="../../../types/gifenc.d.ts" />
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
 * Every file — stacked stills and animated sections alike — then passes through
 * the platform size budget (``fit-budget.ts``): over the cap, it is re-encoded
 * smaller until it fits or the ladder runs out.
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
import type { AnimationFormat } from "../../detail-page/export-platforms";
import { buildGifTimeline } from "../../detail-page/gif-timeline";
import { fitSteps, fitToBudget, pngFallbackSteps } from "./fit-budget";
import { isGifSrc, planGifExport } from "./gif-plan";

export type { AnimationFormat };

/**
 * 플랫폼 폭이 없을 때의 움직이는 섹션 폭 상한.
 *
 * 한때 GIF·WebP 는 512 에 묶여 있었다 — 팔레트 GIF 는 픽셀마다 값을 치르고 WebP
 * 프레임은 서버로 올라가니, 4× 섹션이 수십 MB 가 되는 것을 막는 *전송* 상한이었다.
 * 지금은 그 걱정을 용량 사다리(`fit-budget.ts`)가 맡는다: 플랫폼이 정한 폭으로 굽고,
 * 파일이 상한을 넘으면 거기서 줄인다. 그래서 폭 상한은 "플랫폼 폭" 하나이고, 이
 * 값은 플랫폼을 안 고른 범용 내보내기에서 4× 문서가 폭주하지 않게 잡아 두는 선이다.
 */
export const MAX_ANIMATION_WIDTH = 1080;
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
  toDataURL: (opts: {
    pageId?: string;
    pixelRatio?: number;
    mimeType?: string;
    quality?: number;
  }) => Promise<string>;
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

/**
 * 합성 프레임을 배율만큼 줄인다. 용량 사다리의 한 칸이다.
 *
 * 프레임을 다시 합성하지 않고 비트맵을 줄이는 이유는 비용이다 — 한 섹션의 합성은
 * 프레임마다 캔버스를 다시 그리는 일이라 사다리 칸마다 되풀이할 수 없다. 1 이면 그대로
 * 돌려준다.
 */
function scaleFrames(frames: HTMLCanvasElement[], scale: number): HTMLCanvasElement[] {
  if (scale >= 1) return frames;
  return frames.map((frame) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(frame.width * scale));
    canvas.height = Math.max(1, Math.round(frame.height * scale));
    canvas.getContext("2d")?.drawImage(frame, 0, 0, canvas.width, canvas.height);
    return canvas;
  });
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

/**
 * Wire format for the frames that travel to the server for WebP encoding.
 *
 * They used to go as lossless PNG. That is what a section costs when nothing is
 * thrown away: a 512×2644 composed frame is ~1.4MB as PNG, and a section is up
 * to ``GIF_MAX_FRAMES`` of them — ~56MB of request body, which no edge in front
 * of the API accepts (nginx answers 413 before the app sees a byte).
 *
 * The same frame is ~220KB as quality-92 WebP. Nothing visible is lost on the
 * way: the server's animated WebP is itself encoded at quality 80, so a
 * near-lossless intermediate is already below the floor the output sits on.
 */
const FRAME_WIRE_TYPE = "image/webp";
const FRAME_WIRE_QUALITY = 0.92;

/**
 * Turn a canvas into the Blob that goes over the wire.
 *
 * A browser that cannot encode WebP falls back to PNG on its own — ``toBlob``
 * is specified to use ``image/png`` for a type it does not support — and the
 * server sniffs the bytes rather than trusting the name, so that path still
 * encodes. It just pays the old size.
 */
export function canvasToFrameBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas toBlob failed"))),
      FRAME_WIRE_TYPE,
      FRAME_WIRE_QUALITY,
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
 * WebP, so the frames have to leave the page. See ``FRAME_WIRE_TYPE`` for why
 * they leave as WebP rather than as the PNG they are composed in.
 */
async function encodeFramesAsWebp(
  host: DetailPageHost,
  frames: HTMLCanvasElement[],
  delayMs: number,
  signal?: AbortSignal,
): Promise<Blob> {
  const payload = await Promise.all(frames.map(canvasToFrameBlob));
  const fps = Math.max(1, Math.round(1000 / Math.max(1, delayMs)));
  return host.api.encodeDetailPageAnimation(payload, { fps, format: "webp" }, signal);
}

export type SectionEncodeOptions = {
  /** WebP 인코딩은 서버가 한다 — 브라우저에 애니메이션 WebP 인코더가 없다. */
  host: DetailPageHost;
  format?: AnimationFormat;
  /** 정지 섹션과 같은 배율. 플랫폼 폭에 맞춘 값이 들어온다. */
  pixelRatio?: number;
  /** 섹션 폭 상한(px). 플랫폼 폭이거나 `MAX_ANIMATION_WIDTH`. */
  maxWidth?: number;
  /** 파일 용량 상한. 넘으면 크기를 줄여 다시 굽는다. null 이면 그대로. */
  maxBytes?: number | null;
  signal?: AbortSignal;
};

export type SectionEncodeResult = {
  blob: Blob;
  /** 상한 안에 들어왔는가. 상한이 없으면 항상 참. */
  fitted: boolean;
};

/**
 * 움직이는 섹션 하나를 WebP(기본)·GIF·MP4 로 굽는다.
 *
 * 프레임은 한 번만 합성하고, 용량이 넘으면 그 비트맵을 줄여 다시 인코딩한다.
 */
export async function encodeSectionGif(
  store: unknown,
  pageId: string,
  opts: SectionEncodeOptions,
): Promise<SectionEncodeResult> {
  const { host, signal } = opts;
  const format = opts.format ?? "webp";
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
  // 정지 섹션과 같은 배율로 굽되 폭 상한을 넘지 않는다 — 플랫폼 폭에 맞춘 페이지에서
  // 움직이는 섹션만 좁게 나오면 상세페이지 한가운데 단이 진다.
  const maxWidth = opts.maxWidth ?? MAX_ANIMATION_WIDTH;
  const ratio = Math.min(opts.pixelRatio ?? 1, maxWidth / Math.max(1, page.computedWidth));
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

  const encodeAt = async (frames: HTMLCanvasElement[]): Promise<Blob> => {
    if (format === "gif") return encodeFramesAsGif(frames, timeline.frameDelayMs);
    if (format === "mp4") {
      const { encodeFramesAsMp4 } = await import("./mp4-encode");
      return encodeFramesAsMp4(frames, timeline.frameDelayMs, signal);
    }
    return encodeFramesAsWebp(host, frames, timeline.frameDelayMs, signal);
  };
  // 세 형식 모두 여기서 만질 화질 손잡이가 없다(GIF 는 팔레트, WebP 는 서버 화질 고정,
  // MP4 는 픽셀당 비트레이트 고정). 그래서 크기 사다리만 탄다.
  //
  // WebP 만 한 가지가 더 있다. 프레임이 서버로 올라가므로, 폭이 커지면 결과 파일이
  // 아니라 **요청**이 먼저 상한에 걸린다 — 앞단이 413 을 돌려주고 Blob 은 오지 않는다.
  // 그 오류는 "너무 크다"와 같은 뜻이라 한 칸 줄여 다시 보낸다. 취소는 예외다.
  const fit = await fitToBudget(
    opts.maxBytes,
    fitSteps(false),
    async (step) => {
      const blob = await encodeAt(scaleFrames(composed, step.scale));
      return { value: blob, bytes: blob.size };
    },
    { retryOnError: () => format === "webp" && !signal?.aborted },
  );
  return { blob: fit.value, fitted: fit.fitted };
}

type StillRunResult = SectionEncodeResult & {
  /** 실제로 구운 확장자. PNG 로 시작했어도 상한 때문에 JPG 가 됐을 수 있다. */
  ext: "png" | "jpg";
};

/**
 * 정지 섹션 묶음을 세로로 쌓은 PNG/JPG 한 장.
 *
 * 용량이 넘으면 다시 그린다 — PNG 는 먼저 JPG 로 바꾸고, 그 다음 화질·배율을 내린다.
 * 비트맵을 줄이는 대신 다시 그리는 이유는 정지 섹션은 페이지 몇 장이라 그 비용이
 * 작고, 다시 그린 쪽이 글자가 또렷하기 때문이다.
 */
async function stackPngRun(
  store: StoreLike,
  pageIds: string[],
  indices: number[],
  pixelRatio: number,
  mimeType: string,
  maxBytes: number | null | undefined,
): Promise<StillRunResult> {
  const steps = mimeType === "image/jpeg" ? fitSteps(true) : pngFallbackSteps();
  const fit = await fitToBudget(maxBytes, steps, async (step) => {
    const blob = await stackPngRunAt(
      store,
      pageIds,
      indices,
      pixelRatio * step.scale,
      step.lossy ? "image/jpeg" : "image/png",
      step.lossy ? step.quality : undefined,
    );
    return { value: blob, bytes: blob.size };
  });
  return { blob: fit.value, fitted: fit.fitted, ext: fit.step.lossy ? "jpg" : "png" };
}

async function stackPngRunAt(
  store: StoreLike,
  pageIds: string[],
  indices: number[],
  pixelRatio: number,
  mimeType: string,
  quality: number | undefined,
): Promise<Blob> {
  const urls: string[] = [];
  for (const i of indices) {
    urls.push(await store.toDataURL({ pageId: pageIds[i], pixelRatio, mimeType, quality }));
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
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, quality),
  );
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
  /** 움직이는 섹션 폭 상한(px). 플랫폼 폭. 없으면 `MAX_ANIMATION_WIDTH`. */
  animationMaxWidth?: number;
  /** 파일 하나의 용량 상한(bytes). 정지 묶음과 움직이는 섹션 각각에 건다. */
  maxBytes?: number | null;
  /** Optional progress callback: (done, total) units. */
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  /** 소싱 서버 접근(애니메이션 WebP 인코딩). */
  host: DetailPageHost;
};

export type GifZipResult = {
  blob: Blob;
  /** 사다리 끝까지 내려도 용량 상한을 넘은 파일 이름들. 비어 있으면 전부 들어왔다. */
  unfitted: string[];
  /** PNG 로는 상한을 넘어 JPG 로 바꿔 담은 파일 이름들. */
  converted: string[];
};

/**
 * Build the full ZIP for a document that contains at least one animated
 * section. Contiguous still sections stack into one ``label.ext`` PNG/JPG; each
 * animated section is a standalone ``label.webp`` (or ``.gif``/``.mp4``).
 */
export async function exportGifZip(store: unknown, opts: GifZipOptions): Promise<GifZipResult> {
  const s = store as StoreLike;
  const units = planGifExport(opts.gifFlags);
  const animationFormat = opts.animationFormat ?? "webp";
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const unfitted: string[] = [];
  const converted: string[] = [];
  let done = 0;
  for (const unit of units) {
    if (unit.kind === "gif") {
      const name = `${unit.label}.${animationFormat}`;
      const { blob, fitted } = await encodeSectionGif(s, opts.pageIds[unit.page], {
        host: opts.host,
        format: animationFormat,
        pixelRatio: opts.pixelRatio,
        maxWidth: opts.animationMaxWidth,
        maxBytes: opts.maxBytes,
        signal: opts.signal,
      });
      if (!fitted) unfitted.push(name);
      zip.file(name, blob);
    } else {
      const { blob, fitted, ext } = await stackPngRun(
        s,
        opts.pageIds,
        unit.pages,
        opts.pixelRatio,
        opts.mimeType,
        opts.maxBytes,
      );
      const name = `${unit.label}.${ext}`;
      if (!fitted) unfitted.push(name);
      if (ext !== opts.ext) converted.push(name);
      zip.file(name, blob);
    }
    opts.onProgress?.(++done, units.length);
  }
  return { blob: await zip.generateAsync({ type: "blob" }), unfitted, converted };
}
