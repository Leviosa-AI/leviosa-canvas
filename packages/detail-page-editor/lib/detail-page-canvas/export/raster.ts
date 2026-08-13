import {
  linearGradientKonvaProps,
  parseCssGradient,
  radialGradientKonvaProps,
} from "@leviosa-ai/canvas/paint/konva-fallback";
import type { ExportElement } from "./document-model";
import { cssFont, layoutText, normalizeFontWeight, transformText } from "./text-layout";

/**
 * Canvas rasterization for export layers (PSD layer pixels + composite). All
 * geometry is in document pixels; the caller positions each element canvas.
 *
 * A structural 2D-context type keeps this testable in jsdom, where
 * ``canvas.getContext('2d')`` returns null — tests inject a recording stub.
 */
export type Raster2D = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "beginPath"
  | "closePath"
  | "rect"
  | "moveTo"
  | "lineTo"
  | "arcTo"
  | "ellipse"
  | "clip"
  | "translate"
  | "scale"
  | "fill"
  | "stroke"
  | "fillRect"
  | "fillText"
  | "measureText"
  | "createLinearGradient"
  | "createRadialGradient"
  | "drawImage"
> & {
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  letterSpacing?: string;
};

export type DrawableImage = { width: number; height: number };

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Trace the element outline: rounded rect, or ellipse for circle subtypes. */
export function tracePath(
  ctx: Raster2D,
  el: ExportElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.beginPath();
  if (el.subType === "circle" || el.subType === "ellipse") {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  const r = Math.max(0, Math.min(num(el.cornerRadius), w / 2, h / 2));
  if (r === 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Gradient fill for an element, if it carries one. The custom-props adapter
 * promotes ``custom.gradient`` into ``fill`` for the SDK editor, so both spots
 * are checked.
 */
export function elementGradient(el: ExportElement) {
  return parseCssGradient(el.fill) ?? parseCssGradient(el.custom?.gradient);
}

/** Canvas gradient matching CSS geometry for a w×h box at local (0,0). */
function makeCanvasGradient(
  ctx: Raster2D,
  gradient: NonNullable<ReturnType<typeof parseCssGradient>>,
  w: number,
  h: number,
): CanvasGradient {
  if (gradient.type === "radial") {
    const p = radialGradientKonvaProps(gradient, w, h);
    const g = ctx.createRadialGradient(
      p.fillRadialGradientStartPoint.x,
      p.fillRadialGradientStartPoint.y,
      p.fillRadialGradientStartRadius,
      p.fillRadialGradientEndPoint.x,
      p.fillRadialGradientEndPoint.y,
      p.fillRadialGradientEndRadius,
    );
    for (const stop of gradient.stops) g.addColorStop(clamp01(stop.offset), stop.color);
    return g;
  }
  const p = linearGradientKonvaProps(gradient, w, h);
  const g = ctx.createLinearGradient(
    p.fillLinearGradientStartPoint.x,
    p.fillLinearGradientStartPoint.y,
    p.fillLinearGradientEndPoint.x,
    p.fillLinearGradientEndPoint.y,
  );
  for (const stop of gradient.stops) g.addColorStop(clamp01(stop.offset), stop.color);
  return g;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function applyLetterSpacing(ctx: Raster2D, el: ExportElement): void {
  const spacing = num(el.letterSpacing);
  if (spacing && "letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
}

/** Draw a text element onto ctx at (el.x + ox, el.y + oy). */
export function drawText(ctx: Raster2D, el: ExportElement, ox = 0, oy = 0): void {
  ctx.font = cssFont(el);
  applyLetterSpacing(ctx, el);
  const layout = layoutText(el, (s) => ctx.measureText(s).width);
  const { lines, leading, offsetY, scaleX } = layout;
  const fontSize = num(el.fontSize, 16);
  ctx.save();
  ctx.scale(scaleX, 1);
  ctx.font = cssFont(el);
  applyLetterSpacing(ctx, el);
  ctx.fillStyle = el.fill || "#000";
  ctx.textBaseline = "middle";
  const align = el.align === "center" || el.align === "right" ? el.align : "left";
  ctx.textAlign = align;
  // Anchor in unscaled coordinates, mapped into the condensed space.
  const ax = align === "center" ? num(el.width) / 2 : align === "right" ? num(el.width) : 0;
  const anchorX = (num(el.x) + ox + ax) / scaleX;
  lines.forEach((line, i) => {
    const y = num(el.y) + oy + offsetY + i * leading + leading / 2;
    ctx.fillText(line, anchorX, y);
    if (el.textDecoration === "line-through" && line) {
      const w = ctx.measureText(line).width;
      const lx = anchorX - (align === "center" ? w / 2 : align === "right" ? w : 0);
      ctx.save();
      ctx.strokeStyle = el.fill || "#000";
      ctx.lineWidth = Math.max(1, fontSize / 14);
      ctx.beginPath();
      ctx.moveTo(lx, y);
      ctx.lineTo(lx + w, y);
      ctx.stroke();
      ctx.restore();
    }
  });
  ctx.restore();
}

/** Draw a figure (rect/ellipse) element onto ctx at (el.x + ox, el.y + oy). */
export function drawFigure(ctx: Raster2D, el: ExportElement, ox = 0, oy = 0): void {
  const x = num(el.x) + ox;
  const y = num(el.y) + oy;
  const w = num(el.width);
  const h = num(el.height);
  ctx.save();
  tracePath(ctx, el, x, y, w, h);
  const gradient = elementGradient(el);
  if (gradient) {
    ctx.save();
    ctx.clip();
    ctx.translate(x, y);
    ctx.fillStyle = makeCanvasGradient(ctx, gradient, w, h);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  } else if (el.fill && el.fill !== "transparent") {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }
  if (el.stroke && num(el.strokeWidth) > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = num(el.strokeWidth);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw a pre-decoded image/svg bitmap into the element box (objectFit-aware). */
export function drawBitmap(
  ctx: Raster2D,
  el: ExportElement,
  image: DrawableImage,
  ox = 0,
  oy = 0,
): void {
  const x = num(el.x) + ox;
  const y = num(el.y) + oy;
  const w = num(el.width);
  const h = num(el.height);
  ctx.save();
  tracePath(ctx, el, x, y, w, h);
  ctx.clip();
  const fit = el.custom?.objectFit || "cover";
  const iw = image.width;
  const ih = image.height;
  if (!iw || !ih) {
    ctx.restore();
    return;
  }
  const source = image as CanvasImageSource;
  if (fit === "fill") {
    ctx.drawImage(source, x, y, w, h);
    ctx.restore();
    return;
  }
  const scale = fit === "contain" ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(source, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

/** Neutral gray placeholder for image slots that have no source yet. */
export function drawPlaceholder(ctx: Raster2D, el: ExportElement, ox = 0, oy = 0): void {
  const x = num(el.x) + ox;
  const y = num(el.y) + oy;
  const w = num(el.width);
  const h = num(el.height);
  ctx.save();
  tracePath(ctx, el, x, y, w, h);
  ctx.clip();
  ctx.fillStyle = String(el.custom?.placeholderBg ?? "#e5e7eb");
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y + h);
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();
  ctx.restore();
}

/** Re-export used by PSD text styling. */
export { normalizeFontWeight, transformText };
