// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
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
  applyMatrix,
  elementMatrix,
  isTranslation,
  type Matrix,
} from "./frame";
import {
  drawBitmap,
  drawFigure,
  drawHighlight,
  drawPlaceholder,
  drawText,
  normalizeFontWeight,
  transformText,
  type DrawableImage,
  type Raster2D,
} from "./raster";
import { cssFont, highlightBands, layoutText, resolveLeading } from "./text-layout";
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

/**
 * 요소가 문서에 차지하는 정수 px 경계. 로컬 상자(획 두께만큼 넓힌)의 네 모서리를
 * 요소 행렬로 옮겨 감싼다 — 돌아간 요소도 잘리지 않는다.
 */
function elementBounds(el: ExportElement, matrix: Matrix, extraHeight = 0) {
  const strokeWidth = num(el.strokeWidth);
  const pad = strokeWidth > 0 ? Math.ceil(strokeWidth / 2) : 0;
  const w = num(el.width) + pad;
  const h = Math.max(num(el.height), extraHeight) + pad;
  const corners = [
    applyMatrix(matrix, -pad, -pad),
    applyMatrix(matrix, w, -pad),
    applyMatrix(matrix, w, h),
    applyMatrix(matrix, -pad, h),
  ];
  const left = Math.floor(Math.min(...corners.map((p) => p.x)));
  const top = Math.floor(Math.min(...corners.map((p) => p.y)));
  const right = Math.ceil(Math.max(...corners.map((p) => p.x)));
  const bottom = Math.ceil(Math.max(...corners.map((p) => p.y)));
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/**
 * 문서가 PSD 한계를 넘었다. 대화창은 `code`로 알아보고 번역된 문구와 함께 페이지별
 * 내보내기를 권한다(메시지 원문은 로그용이다).
 */
export class PsdTooLargeError extends Error {
  readonly code = "PSD_TOO_LARGE";
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    super(
      `document ${width}x${height} exceeds the PSD limit of ${PSD_MAX_DIMENSION}px; export per page instead`,
    );
    this.name = "PsdTooLargeError";
  }
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
    throw new PsdTooLargeError(width, totalHeight);
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

    // 페이지를 세로로 쌓으므로 페이지 원점이 dy만큼 내려간다.
    const pageMatrix: Matrix = [1, 0, 0, 1, 0, dy];
    for (const el of page.children ?? []) {
      pageChildren.push(...(await elementToLayers(el, pageMatrix, env, 1)));
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

/**
 * 요소 하나가 만드는 레이어들. 대개 하나지만, 형광펜 띠가 있는 글자는 띠 레이어가
 * 글자 레이어 **아래에** 따로 깔린다 — 편집 가능한 글자 레이어는 Photoshop이 다시
 * 그리므로 띠를 그 안에 구워 넣으면 글자를 고치는 순간 띠가 사라진다.
 */
async function elementToLayers(
  el: ExportElement,
  parent: Matrix,
  env: BuildEnv,
  parentAlpha: number,
): Promise<Layer[]> {
  if (el.visible === false) return [];
  const opacity = num(el.opacity, 1);
  const effectiveAlpha = parentAlpha * opacity;
  const matrix = elementMatrix(el, parent);

  if (el.type === "group") {
    // PSD 그룹 레이어에는 변환이 없다 — 그룹의 이동·회전은 자식 행렬에 실려 간다.
    const children: Layer[] = [];
    for (const child of el.children ?? []) {
      children.push(...(await elementToLayers(child, matrix, env, effectiveAlpha)));
    }
    return [{ name: layerName(el, env), opened: false, opacity, children }];
  }

  const one = (layer: Layer | null) => (layer ? [layer] : []);
  if (el.type === "text") {
    const band = highlightBands(el).length
      ? rasterLayer(el, matrix, env, effectiveAlpha, drawHighlight)
      : null;
    if (band) band.name = `${band.name} highlight`;
    return [...one(band), ...one(textLayer(el, matrix, env, effectiveAlpha))];
  }
  if (el.type === "figure") return one(rasterLayer(el, matrix, env, effectiveAlpha, drawFigure));
  if (el.type === "image" || el.type === "svg") {
    const bitmap = await env.loadBitmap(el).catch(() => null);
    const draw = bitmap
      ? (ctx: Raster2D, e: ExportElement, ox: number, oy: number) =>
          drawBitmap(ctx, e, bitmap, ox, oy)
      : drawPlaceholder;
    return one(rasterLayer(el, matrix, env, effectiveAlpha, draw));
  }
  return []; // unknown element type: skip, keep the export going
}

/** Rasterize an element into its own tight canvas and blit it to the composite. */
function rasterLayer(
  el: ExportElement,
  matrix: Matrix,
  env: BuildEnv,
  effectiveAlpha: number,
  draw: (ctx: Raster2D, el: ExportElement, ox: number, oy: number) => void,
  extraHeight = 0,
): Layer | null {
  const bounds = elementBounds(el, matrix, extraHeight);
  const canvas = env.createCanvas(bounds.width, bounds.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // 그리기 함수는 (el.x + ox, el.y + oy)에 그린다. 옮기기만 하는 행렬이면 그 오프셋으로
  // 충분하고, 돌아간 요소는 캔버스에 행렬을 걸고 로컬 원점(0, 0)에 그리게 한다.
  if (isTranslation(matrix)) {
    draw(ctx, el, matrix[4] - num(el.x) - bounds.left, matrix[5] - num(el.y) - bounds.top);
  } else {
    const [a, b, c, d, e, f] = matrix;
    ctx.save();
    ctx.transform(a, b, c, d, e - bounds.left, f - bounds.top);
    draw(ctx, el, -num(el.x), -num(el.y));
    ctx.restore();
  }

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
  matrix: Matrix,
  env: BuildEnv,
  effectiveAlpha: number,
): Layer | null {
  env.compositeCtx.font = cssFont(el);
  const { blockHeight, offsetY } = layoutText(el, (s) =>
    env.compositeCtx.measureText(s).width,
  );
  const layer = rasterLayer(el, matrix, env, effectiveAlpha, drawText, offsetY + blockHeight);
  if (!layer) return null;
  const origin = applyMatrix(matrix, 0, offsetY);
  const fill = parseColor(el.fill) ?? { r: 0, g: 0, b: 0, a: 1 };
  const fontSize = num(el.fontSize, 16);
  // 스톡 편집기의 letterSpacing은 em이다 — 화면(Konva)처럼 폰트 크기를 곱해 px로 되돌린다.
  const letterSpacing = num(el.letterSpacing) * fontSize;
  const italic = el.fontStyle === "italic";
  const catalogFamilyNames = env.fontPostScriptNames.filter(
    ({ spec }) => spec.family === el.fontFamily,
  );
  const hasCatalogItalic = catalogFamilyNames.some(
    ({ spec }) => spec.italic,
  );

  layer.text = {
    text: transformText(el),
    // 글자 상자의 원점(세로 정렬 오프셋만큼 내린 자리)을 요소 행렬로 옮긴다 — 회전도 같이 실린다.
    transform: [...matrix.slice(0, 4), origin.x, origin.y],
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
      // Photoshop tracking은 1/1000 em이다.
      ...(letterSpacing ? { tracking: Math.round((letterSpacing / fontSize) * 1000) } : {}),
      strikethrough: el.textDecoration === "line-through",
      underline: el.textDecoration === "underline",
    },
    paragraphStyle: { justification: justification(el.align) },
  };
  return layer;
}
