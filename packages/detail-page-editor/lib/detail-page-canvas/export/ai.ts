import { parseCssGradient, linearGradientKonvaProps, radialGradientKonvaProps } from "../konva-fallback";
import {
  documentWidth,
  pageHeight,
  selectPages,
  type ExportDocument,
  type ExportElement,
  type ExportPage,
} from "./document-model";
import { ellipsePath, rectPath } from "./pdf/geometry";
import { inlineSvgOps } from "./pdf/inline-svg";
import {
  parsePaint,
  ResourcePool,
  rgbOps,
  type AiBitmap,
  type PdfEmbeddedFont,
  type RgbColor,
  type ShadingSpec,
} from "./pdf/resources";
import { showTextOps } from "./pdf/text-ops";
import { fmt, PdfBuilder } from "./pdf/writer";
import { decodeSvgDataUri } from "./svg";
import { isItalic, layoutText, normalizeFontWeight, transformText } from "./text-layout";

/**
 * Serializes a Canvas document to an Adobe Illustrator (.ai) file.
 *
 * An .ai file is a PDF underneath (that is what "PDF compatibility" has meant
 * since Illustrator 9), so this builds a PDF: pages become artboards, figures
 * and inline SVG icons become editable vector paths, and text stays text.
 *
 * Catalog fonts are embedded as document-specific subsets. Older/canonical
 * fonts that have no single embeddable source keep the previous non-embedded
 * Adobe-Korea1 fallback, with explicit browser-measured width corrections.
 */

/** Illustrator refuses artboards larger than this (in points). */
export const AI_MAX_DIMENSION = 16383;

export type BuildAiOptions = {
  /** Advance of ``text`` in the element's font (canvas in browser, stub in tests). */
  measure: (el: ExportElement, text: string) => number;
  /** Element-sized bitmap for an image/svg element; null draws nothing. */
  loadBitmap: (el: ExportElement) => Promise<AiBitmap | null>;
  /** zlib deflate; omitted, raw bitmaps are stored uncompressed. */
  deflate?: (data: Uint8Array) => Promise<Uint8Array>;
  /** Font programs generated from only the catalog faces/glyphs this export uses. */
  embeddedFonts?: PdfEmbeddedFont[];
  pageIds?: string[];
  /** true: one tall artboard; false: one artboard per page. */
  merged: boolean;
};

type AiEnv = {
  pool: ResourcePool;
  measure: BuildAiOptions["measure"];
  bitmaps: Map<ExportElement, AiBitmap>;
};

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const rgb = (value: unknown): RgbColor | null => parsePaint(value)?.color ?? null;

/** Gradient stops as PDF shading coordinates, in the page's y-down space. */
function shadingSpec(
  gradient: NonNullable<ReturnType<typeof parseCssGradient>>,
  x: number,
  y: number,
  w: number,
  h: number,
): ShadingSpec | null {
  const stops = gradient.stops
    .map((s) => ({ offset: s.offset, color: rgb(s.color) }))
    .filter((s): s is { offset: number; color: RgbColor } => s.color !== null);
  if (!stops.length) return null;
  if (gradient.type === "radial") {
    const p = radialGradientKonvaProps(gradient, w, h);
    return {
      kind: "radial",
      cx: x + p.fillRadialGradientEndPoint.x,
      cy: y + p.fillRadialGradientEndPoint.y,
      r: p.fillRadialGradientEndRadius,
      stops,
    };
  }
  const p = linearGradientKonvaProps(gradient, w, h);
  return {
    kind: "axial",
    x0: x + p.fillLinearGradientStartPoint.x,
    y0: y + p.fillLinearGradientStartPoint.y,
    x1: x + p.fillLinearGradientEndPoint.x,
    y1: y + p.fillLinearGradientEndPoint.y,
    stops,
  };
}

/** Rotate around the element's own origin, the way Konva does. */
function rotationOps(el: ExportElement): { open: string[]; close: string[] } {
  const degrees = num(el.rotation);
  if (!degrees) return { open: [], close: [] };
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x = num(el.x);
  const y = num(el.y);
  return {
    open: [
      "q",
      `${fmt(cos)} ${fmt(sin)} ${fmt(-sin)} ${fmt(cos)} ` +
        `${fmt(x - x * cos + y * sin)} ${fmt(y - x * sin - y * cos)} cm`,
    ],
    close: ["Q"],
  };
}

function figureOps(el: ExportElement, env: AiEnv): string[] {
  const x = num(el.x);
  const y = num(el.y);
  const w = num(el.width);
  const h = num(el.height);
  if (w <= 0 || h <= 0) return [];

  const path =
    el.subType === "circle" || el.subType === "ellipse"
      ? ellipsePath(x + w / 2, y + h / 2, w / 2, h / 2)
      : rectPath(x, y, w, h, num(el.cornerRadius));

  const gradient = parseCssGradient(el.fill) ?? parseCssGradient(el.custom?.gradient);
  const shading = gradient ? shadingSpec(gradient, x, y, w, h) : null;
  // `rgba(0, 0, 0, 0)` is how the decomposer writes "no fill" — a common shape
  // is a bordered card with a fully transparent interior.
  const fill = shading ? null : parsePaint(el.fill);
  const strokeWidth = num(el.strokeWidth);
  const stroke = strokeWidth > 0 ? parsePaint(el.stroke) : null;
  if (!shading && !fill && !stroke) return [];

  const opacity = num(el.opacity, 1);
  const ops: string[] = ["q"];
  const fillAlpha = opacity * (fill?.alpha ?? 1);
  const strokeAlpha = opacity * (stroke?.alpha ?? 1);
  if (fillAlpha < 1 || strokeAlpha < 1) {
    ops.push(`/${env.pool.alpha(fillAlpha, strokeAlpha)} gs`);
  }

  if (shading) {
    // A shading paints the clip region, so the shape becomes the clip.
    ops.push("q", ...path, "W n", `/${env.pool.shading(shading)} sh`, "Q");
  }
  if (fill || stroke) {
    if (fill) ops.push(`${rgbOps(fill.color)} rg`);
    if (stroke) ops.push(`${rgbOps(stroke.color)} RG`, `${fmt(strokeWidth)} w`);
    ops.push(...path, fill && stroke ? "B" : fill ? "f" : "S");
  }
  ops.push("Q");
  return ops;
}

function imageOps(el: ExportElement, env: AiEnv): string[] {
  const bitmap = env.bitmaps.get(el);
  if (!bitmap) return [];
  const x = num(el.x);
  const y = num(el.y);
  const w = num(el.width);
  const h = num(el.height);
  if (w <= 0 || h <= 0) return [];

  const ops: string[] = ["q"];
  const opacity = num(el.opacity, 1);
  if (opacity < 1) ops.push(`/${env.pool.alpha(opacity)} gs`);
  // Image space runs bottom-up; under the page's y-down CTM the height flips
  // back, so the bitmap's top row lands on the element's top edge.
  ops.push(
    `${fmt(w)} 0 0 ${fmt(-h)} ${fmt(x)} ${fmt(y + h)} cm`,
    `/${env.pool.image(bitmap)} Do`,
    "Q",
  );
  return ops;
}

function svgOps(el: ExportElement, env: AiEnv): string[] {
  const markup = decodeSvgDataUri(String(el.src ?? ""));
  if (markup) {
    const ops = inlineSvgOps(
      markup,
      { x: num(el.x), y: num(el.y), width: num(el.width), height: num(el.height) },
      String(el.custom?.objectFit ?? "contain"),
      env,
    );
    if (ops) {
      const opacity = num(el.opacity, 1);
      return opacity < 1 ? ["q", `/${env.pool.alpha(opacity)} gs`, ...ops, "Q"] : ops;
    }
  }
  return imageOps(el, env); // remote or unparseable: embedded as a bitmap
}

function decorationOps(
  el: ExportElement,
  x: number,
  baseline: number,
  width: number,
  color: RgbColor,
): string[] {
  const decoration = el.textDecoration;
  if (decoration !== "underline" && decoration !== "line-through") return [];
  const fontSize = num(el.fontSize, 16);
  const y = decoration === "underline" ? baseline + fontSize * 0.12 : baseline - fontSize * 0.28;
  const thickness = Math.max(1, fontSize * 0.06);
  return [
    "q",
    `${rgbOps(color)} rg`,
    `${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(thickness)} re`,
    "f",
    "Q",
  ];
}

function textOps(el: ExportElement, env: AiEnv): string[] {
  const text = transformText(el);
  if (!text.trim()) return [];
  const x = num(el.x);
  const y = num(el.y);
  const width = num(el.width);
  const fontSize = num(el.fontSize, 16);
  const layout = layoutText(el, (s) => env.measure(el, s));

  // A gradient-filled text run would need a pattern colour space; the first
  // stop keeps it a solid, editable text object instead of a rasterized one.
  const gradient = parseCssGradient(el.fill);
  const paint = parsePaint(gradient ? gradient.stops[0]?.color : el.fill);
  const color = paint?.color ?? ([0, 0, 0] as RgbColor);

  const fontRes = env.pool.font({
    family: el.fontFamily || "Pretendard",
    weight: normalizeFontWeight(el),
    italic: isItalic(el),
  });

  const ops: string[] = ["q"];
  const alpha = num(el.opacity, 1) * (paint?.alpha ?? 1);
  if (alpha < 1) ops.push(`/${env.pool.alpha(alpha)} gs`);
  ops.push(`${rgbOps(color)} rg`);

  layout.lines.forEach((line, i) => {
    if (!line) return;
    const lineWidth = env.measure(el, line) * layout.scaleX;
    const anchor =
      el.align === "center"
        ? x + (width - lineWidth) / 2
        : el.align === "right"
          ? x + width - lineWidth
          : x;
    // Same baseline the SVG exporter uses: canvas' textBaseline='middle' sits
    // ~0.35em below the centre of the line box.
    const baseline =
      y + layout.offsetY + i * layout.leading + layout.leading / 2 + fontSize * 0.35;
    ops.push(
      ...showTextOps({
        fontRes,
        fontSize,
        x: anchor,
        baseline,
        text: line,
        measure: (t) => env.measure(el, t),
        scaleX: layout.scaleX,
        glyph: (char) => env.pool.textGlyph(fontRes, char),
        skewX: env.pool.syntheticItalic(fontRes) ? Math.tan(Math.PI / 15) : 0,
      }),
      ...decorationOps(el, anchor, baseline, lineWidth, color),
    );
  });
  ops.push("Q");
  return ops;
}

function elementOps(el: ExportElement, env: AiEnv): string[] {
  if (el.visible === false) return [];
  const { open, close } = rotationOps(el);
  let body: string[] = [];
  if (el.type === "group") {
    const opacity = num(el.opacity, 1);
    const children = (el.children ?? []).flatMap((child) => elementOps(child, env));
    if (!children.length) return [];
    // Group children carry absolute page coordinates (see document-model).
    body = opacity < 1 ? ["q", `/${env.pool.alpha(opacity)} gs`, ...children, "Q"] : children;
  } else if (el.type === "text") body = textOps(el, env);
  else if (el.type === "figure") body = figureOps(el, env);
  else if (el.type === "svg") body = svgOps(el, env);
  else if (el.type === "image") body = imageOps(el, env);
  if (!body.length) return [];
  return [...open, ...body, ...close];
}

function pageOps(page: ExportPage, doc: ExportDocument, env: AiEnv, dy: number): string[] {
  const width = documentWidth(doc);
  const height = pageHeight(page, doc);
  const ops: string[] = ["q"];
  if (dy) ops.push(`1 0 0 1 0 ${fmt(dy)} cm`);

  const background = page.background;
  if (typeof background === "string" && background && background !== "transparent") {
    const gradient = parseCssGradient(background);
    const shading = gradient ? shadingSpec(gradient, 0, 0, width, height) : null;
    if (shading) {
      ops.push("q", `0 0 ${fmt(width)} ${fmt(height)} re`, "W n", `/${env.pool.shading(shading)} sh`, "Q");
    } else {
      const paint = parsePaint(background);
      if (paint) {
        ops.push("q");
        if (paint.alpha < 1) ops.push(`/${env.pool.alpha(paint.alpha)} gs`);
        ops.push(`${rgbOps(paint.color)} rg`, `0 0 ${fmt(width)} ${fmt(height)} re`, "f", "Q");
      }
    }
  }
  for (const el of page.children ?? []) ops.push(...elementOps(el, env));
  ops.push("Q");
  return ops;
}

/** Every element that needs a bitmap, in document order. */
function bitmapElements(pages: ExportPage[]): ExportElement[] {
  const found: ExportElement[] = [];
  const walk = (elements?: ExportElement[]) => {
    for (const el of elements ?? []) {
      if (el.visible === false) continue;
      const src = String(el.src ?? "");
      if (el.type === "image" && src) found.push(el);
      // An inline SVG is drawn as vectors; only a remote one needs a bitmap.
      if (el.type === "svg" && src && !decodeSvgDataUri(src)) found.push(el);
      walk(el.children);
    }
  };
  walk(pages.flatMap((page) => page.children ?? []));
  return found;
}

/** Build the .ai (PDF) bytes for the selected pages. */
export async function buildAiPdf(
  doc: ExportDocument,
  opts: BuildAiOptions,
): Promise<Uint8Array> {
  const pages = selectPages(doc, opts.pageIds);
  const width = documentWidth(doc);
  if (!pages.length || width <= 0) throw new Error("빈 문서는 내보낼 수 없습니다");

  const bitmaps = new Map<ExportElement, AiBitmap>();
  for (const el of bitmapElements(pages)) {
    const bitmap = await opts.loadBitmap(el);
    if (bitmap) bitmaps.set(el, bitmap);
  }

  const env: AiEnv = {
    pool: new ResourcePool(opts.embeddedFonts),
    measure: opts.measure,
    bitmaps,
  };
  const builder = new PdfBuilder();

  // The PDF origin is bottom-left; flipping the CTM lets every element keep the
  // top-left, y-down coordinates the document already uses.
  const artboards: Array<{ height: number; ops: string[] }> = [];
  if (opts.merged) {
    const height = pages.reduce((acc, page) => acc + pageHeight(page, doc), 0);
    const ops: string[] = [`1 0 0 -1 0 ${fmt(height)} cm`];
    let dy = 0;
    for (const page of pages) {
      ops.push(...pageOps(page, doc, env, dy));
      dy += pageHeight(page, doc);
    }
    artboards.push({ height, ops });
  } else {
    for (const page of pages) {
      const height = pageHeight(page, doc);
      artboards.push({
        height,
        ops: [`1 0 0 -1 0 ${fmt(height)} cm`, ...pageOps(page, doc, env, 0)],
      });
    }
  }

  const pagesRef = builder.alloc();
  const encoder = new TextEncoder();
  const pageRefs = await Promise.all(
    artboards.map(async (artboard) => {
      const content = builder.addStream(
        opts.deflate ? "/Filter /FlateDecode" : "",
        opts.deflate
          ? await opts.deflate(encoder.encode(artboard.ops.join("\n")))
          : encoder.encode(artboard.ops.join("\n")),
      );
      return { content, height: artboard.height };
    }),
  );

  // Resources are written last: the content streams above are what filled them.
  const resources = await env.pool.write(builder, opts.deflate);
  const kids = pageRefs.map(({ content, height }) =>
    builder.add(
      `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${fmt(width)} ${fmt(height)}] ` +
        `/Resources ${resources} /Contents ${content} 0 R >>`,
    ),
  );
  builder.set(
    pagesRef,
    `<< /Type /Pages /Kids [${kids.map((r) => `${r} 0 R`).join(" ")}] /Count ${kids.length} >>`,
  );
  const catalog = builder.add(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
  return builder.build(catalog);
}
