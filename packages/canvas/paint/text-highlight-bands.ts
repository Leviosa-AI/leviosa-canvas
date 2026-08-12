import Konva from "konva";

/**
 * 원본은 ``text-background-plan``에서 이 함수를 끌어왔다. 패키지 경계 안에서는
 * 앱 모듈을 못 부르므로 **열 줄짜리 순수 함수만** 여기로 데려왔다(모듈 전체가 아니라).
 * 원본과 함께 지워질 코드다 — G9에서 기존 경로가 이 패키지를 재수출하게 되면 한 벌만 남는다.
 */
function isTransparentColor(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const color = value.trim().toLowerCase();
  if (!color || color === "transparent" || color === "none") return true;
  const rgba = color.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const parts = rgba[1].split(",").map((part) => part.trim());
    if (parts.length === 4) return parseFloat(parts[3]) === 0;
  }
  return false;
}

/**
 * A per-line "marker" highlight: instead of one box behind the whole text (which,
 * with a loose paragraph line-height, balloons into a solid block that swallows the
 * gap between wrapped lines), we paint ONE band per visual line, each hugging that
 * line's own text width. That reads as a highlighter pen — bands differ in width and
 * a gap shows between lines.
 *
 * The line breaks MUST match what the editor/preview actually render, so we measure
 * with an offscreen ``Konva.Text`` configured identically (same font, width, wrap,
 * line-height). Konva populates ``textArr`` (its wrapped-line layout) in the
 * constructor without needing a stage, so this is synchronous and deterministic —
 * and, being the same engine, it wraps Korean no-space runs by character exactly as
 * the visible text does.
 *
 * The band is stored on the element as ``custom.highlightColor`` (a single source of
 * truth); the stock editor's native ``backgroundEnabled`` box is left off so the two never
 * double up. Both renderers — the SDK editor (``BackgroundAwareText``) and the Konva
 * export/preview — draw bands from the same computation here.
 */

export type HighlightBand = {
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
};

export type HighlightBandInput = {
  text: string;
  fontSize: number;
  fontFamily?: string;
  fontWeight?: unknown;
  fontStyle?: unknown;
  /** The text box width the visible text wraps against. */
  boxWidth: number;
  /** Unitless line-height ratio (px strings must be resolved by the caller). */
  lineHeightRatio: number;
  align?: string;
  color?: unknown;
};

// Band geometry, all relative to fontSize so it scales with the text.
const PAD_X_RATIO = 0.16; // horizontal overhang past the glyphs on each side
const BAND_H_RATIO = 1.3; // band height around the glyphs (tight, not the line box)

/** Resolve a Canvas/CSS line-height (number ratio or ``"30.78px"``) to a ratio. */
export function lineHeightRatioFor(raw: unknown, fontSize: number): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const px = /^(-?\d*\.?\d+)px$/.exec(raw.trim());
    if (px && fontSize > 0) {
      const ratio = parseFloat(px[1]) / fontSize;
      if (Number.isFinite(ratio) && ratio > 0) return ratio;
    }
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1.2;
}

function konvaFontStyle(fontWeight: unknown, fontStyle: unknown): string {
  const bold = /(bold|[6-9]00)/i.test(String(fontWeight ?? ""));
  const italic = String(fontStyle ?? "") === "italic";
  return [bold ? "bold" : "", italic ? "italic" : ""].join(" ").trim() || "normal";
}

/** Wrapped lines with their pixel widths, via an offscreen Konva.Text. */
export function measureHighlightLines(
  input: HighlightBandInput,
): { text: string; width: number }[] {
  const node = new Konva.Text({
    text: String(input.text ?? ""),
    fontSize: input.fontSize,
    fontFamily: input.fontFamily || "Arial",
    fontStyle: konvaFontStyle(input.fontWeight, input.fontStyle),
    lineHeight: input.lineHeightRatio,
    width: input.boxWidth > 0 ? input.boxWidth : undefined,
    wrap: input.boxWidth > 0 ? "word" : "none",
  });
  const arr = (node.textArr ?? []) as Array<{ text?: string; width?: number }>;
  const lines = arr.map((l) => ({
    text: String(l.text ?? ""),
    width: Number(l.width) || 0,
  }));
  const fallbackWidth = (() => {
    try {
      return node.getTextWidth();
    } catch {
      return 0;
    }
  })();
  node.destroy();
  return lines.length
    ? lines
    : [{ text: String(input.text ?? ""), width: fallbackWidth }];
}

/**
 * Per-line marker bands in the text's LOCAL coordinate space (origin at the text
 * box's top-left, before the element's own x/y/rotation transform). Blank lines
 * produce no band. Returns [] when there is nothing to paint.
 */
export function computeHighlightBands(input: HighlightBandInput): HighlightBand[] {
  const fs = input.fontSize;
  if (!(fs > 0) || isTransparentColor(input.color)) return [];
  const lineH = fs * input.lineHeightRatio;
  const padX = fs * PAD_X_RATIO;
  const bandH = Math.min(fs * BAND_H_RATIO, lineH); // never taller than the line box
  const cornerRadius = Math.min(bandH * 0.28, 6);
  const align = String(input.align ?? "left").toLowerCase();
  const boxWidth = input.boxWidth;

  return measureHighlightLines(input).flatMap((line, i) => {
    if (!line.text.trim()) return [];
    const w = Math.max(0, line.width) + padX * 2;
    let x = -padX; // left / start
    if (align === "center") x = (boxWidth - line.width) / 2 - padX;
    else if (align === "right" || align === "end") x = boxWidth - line.width - padX;
    const yCenter = i * lineH + lineH / 2;
    return [{ x, y: yCenter - bandH / 2, width: w, height: bandH, cornerRadius }];
  });
}
