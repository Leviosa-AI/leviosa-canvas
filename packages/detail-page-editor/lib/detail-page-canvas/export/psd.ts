import type { Layer, Psd } from "ag-psd";

import { parseColor } from "./color";
import { parseCssGradient } from "@leviosa-ai/canvas/paint/konva-fallback";
import {
  documentWidth,
  pageHeight,
  selectPages,
  type ExportDocument,
  type ExportElement,
} from "./document-model";
import {
  drawBitmap,
  drawFigure,
  drawPlaceholder,
  drawText,
  normalizeFontWeight,
  transformText,
  type DrawableImage,
  type Raster2D,
} from "./raster";
import { cssFont, layoutText, resolveLeading } from "./text-layout";
import {
  pdfFontName,
  type PdfFontSpec,
} from "./pdf/resources";

/**
 * Maps a Canvas document JSON to an ag-psd document object: pages become
 * collapsed layer groups stacked vertically, text elements become editable
 * PSD text layers (with a raster cache so dumb viewers still render), and
 * figure/svg/image elements become raster layers.
 *
 * This is the browser port of ``exporters/psd_exporter`` in
 * leviosa-sourcing-server-cafe24 — keep the two in sync when the layer
 * mapping changes.
 */

// Photoshop stores files up to 30,000 px per side (PSB would go further, but
// ag-psd writes classic PSD).
export const PSD_MAX_DIMENSION = 30000;

const FONT_PS_NAMES: Array<[number, string]> = [
  [450, "Pretendard-Regular"],
  [650, "Pretendard-SemiBold"],
  [750, "Pretendard-Bold"],
  [Infinity, "Pretendard-ExtraBold"],
];

/** PostScript name Photoshop should resolve for an editable type layer. */
export function fontPostScriptName(
  family: string | undefined,
  fontWeight: number | string | undefined,
  italic = false,
  catalogNames: Array<{ spec: PdfFontSpec; name: string }> = [],
): string {
  const w = Number(fontWeight) || 400;
  const requested = { family: family || "Pretendard", weight: w, italic };
  const exact = catalogNames.find(
    ({ spec }) =>
      spec.family === requested.family &&
      spec.weight === requested.weight &&
      spec.italic === requested.italic,
  );
  if (exact) return exact.name;
  const familyNames = catalogNames.filter(
    ({ spec }) => spec.family === requested.family,
  );
  const sameStyle = familyNames.filter(
    ({ spec }) => spec.italic === requested.italic,
  );
  const nearest = (sameStyle.length ? sameStyle : familyNames)
    .filter(
      ({ spec }) =>
        spec.family === requested.family,
    )
    .sort(
      (a, b) =>
        Math.abs(a.spec.weight - w) - Math.abs(b.spec.weight - w),
    )[0];
  if (nearest) return nearest.name;

  if (requested.family !== "Pretendard") return pdfFontName(requested);
  const found = FONT_PS_NAMES.find(([max]) => w < max);
  const name = found ? found[1] : "Pretendard-Regular";
  return italic ? `${name}-Italic` : name;
}

function justification(align: string | undefined): "left" | "center" | "right" {
  return align === "center" || align === "right" ? align : "left";
}

type ExportCanvas = {
  width: number;
  height: number;
  getContext(kind: "2d"): Raster2D | null;
};

export type BuildPsdOptions = {
  createCanvas: (width: number, height: number) => ExportCanvas;
  /** Artifact slot_bindings; used for layer names. */
  slotBindings?: Record<string, { element_id?: string } | undefined>;
  /** Resolve image/svg src to a drawable; null renders a placeholder. */
  loadBitmap?: (el: ExportElement) => Promise<DrawableImage | null>;
  /** Export only these page ids (document order); default all pages. */
  pageIds?: string[];
  /** Real PostScript names parsed from catalog font programs. */
  fontPostScriptNames?: Array<{ spec: PdfFontSpec; name: string }>;
};

type BuildEnv = {
  createCanvas: BuildPsdOptions["createCanvas"];
  compositeCtx: Raster2D;
  slotNameByElementId: Record<string, string>;
  loadBitmap: NonNullable<BuildPsdOptions["loadBitmap"]>;
  fontPostScriptNames: NonNullable<BuildPsdOptions["fontPostScriptNames"]>;
};

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Integer pixel bounds for an element, padded so strokes are not clipped. */
function elementBounds(el: ExportElement, dy: number, extraHeight = 0) {
  const strokeWidth = num(el.strokeWidth);
  const pad = strokeWidth > 0 ? Math.ceil(strokeWidth / 2) : 0;
  const left = Math.floor(num(el.x) - pad);
  const top = Math.floor(num(el.y) + dy - pad);
  const right = Math.ceil(num(el.x) + num(el.width) + pad);
  const bottom = Math.ceil(num(el.y) + dy + Math.max(num(el.height), extraHeight) + pad);
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/** Build the ag-psd document for a Canvas document (pages stacked). */
export async function buildPsd(doc: ExportDocument, opts: BuildPsdOptions): Promise<Psd> {
  const {
    createCanvas,
    slotBindings = {},
    loadBitmap = async () => null,
    fontPostScriptNames = [],
  } = opts;
  const pages = selectPages(doc, opts.pageIds);
  const width = documentWidth(doc);
  const pageHeights = pages.map((p) => pageHeight(p, doc));
  const totalHeight = pageHeights.reduce((a, b) => a + b, 0);
  if (width > PSD_MAX_DIMENSION || totalHeight > PSD_MAX_DIMENSION) {
    throw new Error(
      `document ${width}x${totalHeight} exceeds the PSD limit of ${PSD_MAX_DIMENSION}px; export per page instead`,
    );
  }

  const slotNameByElementId: Record<string, string> = {};
  for (const [slot, binding] of Object.entries(slotBindings)) {
    if (binding?.element_id) slotNameByElementId[binding.element_id] = slot;
  }

  const composite = createCanvas(Math.max(1, width), Math.max(1, totalHeight));
  const compositeCtx = composite.getContext("2d");
  if (!compositeCtx) throw new Error("canvas 2d context unavailable");
  const env: BuildEnv = {
    createCanvas,
    compositeCtx,
    slotNameByElementId,
    loadBitmap,
    fontPostScriptNames,
  };

  const children: Layer[] = [];
  let dy = 0;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const currentPageHeight = pageHeights[i];
    const pageChildren: Layer[] = [];

    // Any non-transparent CSS background paints a layer: 'rgb(…)', named
    // colors like the stock editor's default 'white', or a gradient string.
    const bg = page.background;
    if (typeof bg === "string" && bg && bg !== "transparent") {
      const canvas = createCanvas(width, currentPageHeight);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const gradient = parseCssGradient(bg);
        if (gradient) {
          drawFigure(ctx, {
            type: "figure",
            x: 0,
            y: 0,
            width,
            height: currentPageHeight,
            custom: { gradient: bg },
          });
        } else {
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, width, currentPageHeight);
        }
        compositeCtx.drawImage(canvas as unknown as CanvasImageSource, 0, dy);
        pageChildren.push({
          name: "background",
          left: 0,
          top: dy,
          canvas: canvas as unknown as HTMLCanvasElement,
        });
      }
    }

    for (const el of page.children ?? []) {
      const layer = await elementToLayer(el, dy, env, 1);
      if (layer) pageChildren.push(layer);
    }

    children.push({
      name: `p${String(i + 1).padStart(2, "0")} ${page.name || page.id || ""}`.trim(),
      opened: false,
      children: pageChildren,
    });
    dy += currentPageHeight;
  }

  return {
    width,
    height: totalHeight,
    children,
    canvas: composite as unknown as HTMLCanvasElement,
  };
}

function layerName(el: ExportElement, env: BuildEnv): string {
  return (el.id && env.slotNameByElementId[el.id]) || el.name || el.id || el.type || "layer";
}

async function elementToLayer(
  el: ExportElement,
  dy: number,
  env: BuildEnv,
  parentAlpha: number,
): Promise<Layer | null> {
  if (el.visible === false) return null;
  const opacity = num(el.opacity, 1);
  const effectiveAlpha = parentAlpha * opacity;

  if (el.type === "group") {
    const children: Layer[] = [];
    for (const child of el.children ?? []) {
      const layer = await elementToLayer(child, dy, env, effectiveAlpha);
      if (layer) children.push(layer);
    }
    return { name: layerName(el, env), opened: false, opacity, children };
  }

  if (el.type === "text") return textLayer(el, dy, env, effectiveAlpha);
  if (el.type === "figure") return rasterLayer(el, dy, env, effectiveAlpha, drawFigure);
  if (el.type === "image" || el.type === "svg") {
    const bitmap = await env.loadBitmap(el).catch(() => null);
    const draw = bitmap
      ? (ctx: Raster2D, e: ExportElement, ox: number, oy: number) =>
          drawBitmap(ctx, e, bitmap, ox, oy)
      : drawPlaceholder;
    return rasterLayer(el, dy, env, effectiveAlpha, draw);
  }
  return null; // unknown element type: skip, keep the export going
}

/** Rasterize an element into its own tight canvas and blit it to the composite. */
function rasterLayer(
  el: ExportElement,
  dy: number,
  env: BuildEnv,
  effectiveAlpha: number,
  draw: (ctx: Raster2D, el: ExportElement, ox: number, oy: number) => void,
  extraHeight = 0,
): Layer | null {
  const bounds = elementBounds(el, dy, extraHeight);
  const canvas = env.createCanvas(bounds.width, bounds.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  draw(ctx, el, -bounds.left, dy - bounds.top);

  const composite = env.compositeCtx as Raster2D & { globalAlpha?: number };
  composite.save();
  composite.globalAlpha = effectiveAlpha;
  composite.drawImage(canvas as unknown as CanvasImageSource, bounds.left, bounds.top);
  composite.restore();

  return {
    name: layerName(el, env),
    left: bounds.left,
    top: bounds.top,
    opacity: num(el.opacity, 1),
    canvas: canvas as unknown as HTMLCanvasElement,
  };
}

/** Editable PSD text layer carrying the rendered pixels as its raster cache. */
function textLayer(
  el: ExportElement,
  dy: number,
  env: BuildEnv,
  effectiveAlpha: number,
): Layer | null {
  env.compositeCtx.font = cssFont(el);
  const { blockHeight, offsetY, scaleX } = layoutText(el, (s) =>
    env.compositeCtx.measureText(s).width,
  );
  const layer = rasterLayer(el, dy, env, effectiveAlpha, drawText, offsetY + blockHeight);
  if (!layer) return null;
  const fill = parseColor(el.fill) ?? { r: 0, g: 0, b: 0, a: 1 };
  const fontSize = num(el.fontSize, 16);
  const letterSpacing = num(el.letterSpacing);
  const italic = el.fontStyle === "italic";
  const catalogFamilyNames = env.fontPostScriptNames.filter(
    ({ spec }) => spec.family === el.fontFamily,
  );
  const hasCatalogItalic = catalogFamilyNames.some(
    ({ spec }) => spec.italic,
  );

  layer.text = {
    text: transformText(el),
    transform: [1, 0, 0, 1, num(el.x), num(el.y) + dy + offsetY],
    shapeType: "box",
    boxBounds: [0, 0, num(el.width), Math.max(num(el.height) - offsetY, blockHeight)],
    antiAlias: "smooth",
    style: {
      font: {
        name: fontPostScriptName(
          el.fontFamily,
          normalizeFontWeight(el),
          italic,
          env.fontPostScriptNames,
        ),
      },
      fontSize,
      fillColor: { r: fill.r, g: fill.g, b: fill.b },
      autoLeading: false,
      leading: resolveLeading(el),
      ...(italic && catalogFamilyNames.length && !hasCatalogItalic
        ? { fauxItalic: true }
        : {}),
      ...(scaleX < 1 ? { horizontalScale: scaleX } : {}),
      // Photoshop tracking is in 1/1000 em; our letterSpacing is px.
      ...(letterSpacing ? { tracking: Math.round((letterSpacing / fontSize) * 1000) } : {}),
      strikethrough: el.textDecoration === "line-through",
      underline: el.textDecoration === "underline",
    },
    paragraphStyle: { justification: justification(el.align) },
  };
  return layer;
}
