import { writePsdBuffer } from "ag-psd";

import { buildAiPdf } from "./ai";
import type { ExportDocument, ExportElement, ExportPage } from "./document-model";
import {
  buildCatalogFontSubsets,
  loadCatalogPostScriptNames,
} from "./font-subset";
import type { AiBitmap } from "./pdf/resources";
import { buildPsd } from "./psd";
import { drawBitmap, drawPlaceholder, type Raster2D } from "./raster";
import { buildSvgDocument, buildSvgPages } from "./svg";
import { cssFont } from "./text-layout";

/**
 * Browser glue for the PSD / Figma-SVG / Illustrator exporters: waits for
 * webfonts, decodes bitmaps CORS-safely, and returns downloadable Blobs.
 * Everything document-shaped stays in psd.ts / svg.ts / ai.ts so it can be
 * unit-tested without a DOM.
 *
 * Loaded lazily from the download dialog (dynamic import) so ag-psd never
 * lands in the editor's main bundle.
 */

export type PsdExportOptions = {
  slotBindings?: Record<string, { element_id?: string } | undefined>;
  pageIds?: string[];
};

export type SvgExportOptions = {
  pageIds?: string[];
  /** true: one stacked SVG; false: one Blob per page. */
  merged: boolean;
};

export type AiExportOptions = {
  pageIds?: string[];
  /** true: one tall artboard; false: one artboard per page. */
  merged: boolean;
};

function walkElements(pages: ExportPage[], visit: (el: ExportElement) => void): void {
  const walk = (elements?: ExportElement[]) => {
    for (const el of elements ?? []) {
      visit(el);
      walk(el.children);
    }
  };
  for (const page of pages) walk(page.children);
}

/**
 * Ask the browser to have every (family, weight, style) combination the
 * document uses ready before canvas rasterization; a font that falls back
 * silently would rasterize and measure with the wrong metrics.
 */
async function ensureFontsLoaded(doc: ExportDocument): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const wanted = new Set<string>();
  walkElements(doc.pages ?? [], (el) => {
    if (el.type === "text") wanted.add(cssFont({ ...el, fontSize: 16 }));
  });
  await Promise.allSettled([...wanted].map((font) => document.fonts.load(font)));
  await document.fonts.ready.catch(() => undefined);
}

/** Decode an image CORS-safely; null lets the caller draw a placeholder. */
function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Cross-origin pixels would taint the canvas and make ag-psd's
    // getImageData throw; our sources are same-origin or CORS-enabled S3.
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Build a layered PSD Blob for the document (selected pages stacked). */
export async function exportPsdBlob(
  doc: ExportDocument,
  opts: PsdExportOptions = {},
): Promise<Blob> {
  await ensureFontsLoaded(doc);
  const fontPostScriptNames = await loadCatalogPostScriptNames(
    doc,
    opts.pageIds,
  );
  const psd = await buildPsd(doc, {
    createCanvas: (w, h) => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));
      return canvas;
    },
    slotBindings: opts.slotBindings,
    pageIds: opts.pageIds,
    fontPostScriptNames,
    loadBitmap: async (el) => {
      const src = String(el.src ?? "");
      if (!src) return null;
      return loadImageElement(src);
    },
  });
  const buffer = writePsdBuffer(psd);
  // ag-psd 타입은 Node Buffer지만 브라우저 런타임에선 Uint8Array다.
  return new Blob([buffer as unknown as Uint8Array<ArrayBuffer>], {
    type: "image/vnd.adobe.photoshop",
  });
}

function fetchAsDataUri(src: string): Promise<string | null> {
  return fetch(src)
    .then((res) => (res.ok ? res.blob() : null))
    .then(
      (blob) =>
        blob &&
        new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        }),
    )
    .catch(() => null);
}

/**
 * Embed every remote image as a data URI so the SVG file is self-contained —
 * Figma cannot fetch our (auth-guarded) URLs when the file is dropped in.
 * Sources that fail to fetch keep their original URL rather than breaking
 * the whole export.
 */
async function buildHrefMap(doc: ExportDocument, pageIds?: string[]): Promise<Map<string, string>> {
  const pages = pageIds?.length
    ? (doc.pages ?? []).filter((p) => p.id && pageIds.includes(p.id))
    : (doc.pages ?? []);
  const remote = new Set<string>();
  walkElements(pages, (el) => {
    const src = String(el.src ?? "");
    if ((el.type === "image" || el.type === "svg") && src && !src.startsWith("data:")) {
      remote.add(src);
    }
  });
  const entries = await Promise.all(
    [...remote].map(async (src) => [src, await fetchAsDataUri(src)] as const),
  );
  const map = new Map<string, string>();
  for (const [src, dataUri] of entries) if (dataUri) map.set(src, dataUri);
  return map;
}

/** Measure text with a shared canvas context in the element's font. */
function makeCanvasMeasure(): (el: ExportElement, text: string) => number {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return () => 0;
  return (el, text) => {
    ctx.font = cssFont(el);
    // 스톡 편집기의 letterSpacing은 em이다 (Konva에는 letterSpacing * fontSize로 넘어간다).
    // px로 재면 자간이 실제보다 넓게 잡혀, 딱 맞는 텍스트가 '넘친다'고 오판된다.
    const em = Number(el.letterSpacing);
    const spacing = Number.isFinite(em) ? em * (Number(el.fontSize) || 16) : 0;
    const withSpacing = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ("letterSpacing" in withSpacing) {
      withSpacing.letterSpacing = spacing ? `${spacing}px` : "0px";
    }
    return ctx.measureText(text).width;
  };
}

/** Build Figma-compatible SVG Blob(s): one merged file or one per page. */
export async function exportSvgBlobs(
  doc: ExportDocument,
  opts: SvgExportOptions,
): Promise<Blob[]> {
  await ensureFontsLoaded(doc);
  const hrefMap = await buildHrefMap(doc, opts.pageIds);
  const buildOpts = {
    measure: makeCanvasMeasure(),
    hrefFor: (src: string) => hrefMap.get(src) ?? src,
    pageIds: opts.pageIds,
  };
  const documents = opts.merged
    ? [buildSvgDocument(doc, buildOpts)]
    : buildSvgPages(doc, buildOpts);
  return documents.map((svg) => new Blob([svg], { type: "image/svg+xml" }));
}

/**
 * zlib deflate for PDF ``/FlateDecode`` streams. ``CompressionStream("deflate")``
 * emits the zlib wrapper PDF expects (``deflate-raw`` would not).
 */
function deflateBytes(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Response(stream).arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.95);
  });
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Bake an image/svg element into an element-sized bitmap, applying the same
 * objectFit and corner rounding the editor paints — so the PDF places it as a
 * plain rectangle and the framing cannot drift from the canvas.
 *
 * Opaque artwork ships as JPEG (DCTDecode passthrough, small); anything with
 * transparency ships as raw RGB plus an alpha soft mask, because flattening a
 * cut-out product shot onto white is exactly the bug this avoids.
 */
async function bakeBitmap(el: ExportElement): Promise<AiBitmap | null> {
  const src = String(el.src ?? "");
  if (!src) return null;
  const width = Math.max(1, Math.round(Number(el.width) || 0));
  const height = Math.max(1, Math.round(Number(el.height) || 0));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d") as Raster2D | null;
  if (!ctx) return null;

  const image = await loadImageElement(src);
  const ox = -Number(el.x ?? 0);
  const oy = -Number(el.y ?? 0);
  if (image) drawBitmap(ctx, el, image, ox, oy);
  else drawPlaceholder(ctx, el, ox, oy);

  const pixels = (ctx as unknown as CanvasRenderingContext2D).getImageData(
    0,
    0,
    width,
    height,
  ).data;
  const rgb = new Uint8Array(width * height * 3);
  const alpha = new Uint8Array(width * height);
  let opaque = true;
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = pixels[i * 4];
    rgb[i * 3 + 1] = pixels[i * 4 + 1];
    rgb[i * 3 + 2] = pixels[i * 4 + 2];
    alpha[i] = pixels[i * 4 + 3];
    if (alpha[i] < 255) opaque = false;
  }

  if (opaque) {
    const jpeg = await canvasToJpeg(canvas);
    if (jpeg) return { width, height, format: "jpeg", data: jpeg };
  }
  return { width, height, format: "rgb", data: rgb, ...(opaque ? {} : { alpha }) };
}

/**
 * Build an Adobe Illustrator (.ai) Blob. The file is a PDF — that is what an
 * .ai has been since Illustrator 9 — with editable text and vector artwork.
 */
export async function exportAiBlob(
  doc: ExportDocument,
  opts: AiExportOptions,
): Promise<Blob> {
  await ensureFontsLoaded(doc);
  const embeddedFonts = await buildCatalogFontSubsets(doc, opts.pageIds);
  const bytes = await buildAiPdf(doc, {
    measure: makeCanvasMeasure(),
    loadBitmap: bakeBitmap,
    deflate: typeof CompressionStream === "undefined" ? undefined : deflateBytes,
    pageIds: opts.pageIds,
    merged: opts.merged,
    embeddedFonts,
  });
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
