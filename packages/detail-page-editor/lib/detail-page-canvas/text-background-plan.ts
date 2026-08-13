import { parseCssGradient, type ParsedGradient } from "@leviosa-ai/canvas/paint/konva-fallback";
import { isTransparentColor } from "@leviosa-ai/canvas/paint/text-highlight-bands";

/**
 * The Canvas SDK editor paints a text element's background as a per-line
 * CONTOUR filled with a single solid ``backgroundColor`` (see
 * ``canvas/canvas/text-element``). Two decomposed cases break on that:
 *
 * 1. **Highlight gradients** (#3) — a highlighter band drawn in CSS with
 *    ``background-image: linear-gradient(transparent 60%, <color> 60%)`` lands in
 *    ``custom.backgroundGradient`` with a transparent ``backgroundColor``. Canvas
 *    can only fill a solid colour, so the band vanishes.
 * 2. **Multi-line badges** (#2) — when a badge's lines differ in width, the
 *    per-line contour steps in and out, notching the badge's bottom edge.
 *
 * Both are fixed by painting a clean rectangle BEHIND the stock text: a gradient
 * rect restores the highlight, and a solid bounding rect (same colour) unions
 * with the stock contour to fill the notch. This module is the pure planner so
 * the geometry is unit-testable without a Konva canvas.
 */

export type TextBackgroundModel = {
  text?: unknown;
  fontSize?: number;
  lineHeight?: unknown;
  backgroundEnabled?: boolean;
  backgroundColor?: unknown;
  backgroundCornerRadius?: number;
  width?: number;
  height?: number;
  custom?: { backgroundGradient?: unknown } | null;
  a?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    opacity?: number;
    fontSize?: number;
  } | null;
};

export type TextBackgroundPlan =
  | {
      type: "gradient";
      gradient: ParsedGradient;
      width: number;
      height: number;
      cornerRadius: number;
    }
  | {
      type: "solid";
      fill: string;
      width: number;
      height: number;
      cornerRadius: number;
    }
  | null;

/**
 * Decide what background rect (if any) to paint behind a Canvas text element.
 * Returns ``null`` when the stock per-line contour is already correct (e.g. a
 * single-line solid pill) so those elements render untouched.
 */
export function planTextBackground(
  model: TextBackgroundModel,
): TextBackgroundPlan {
  const width = model.a?.width ?? model.width ?? 0;
  const height = model.a?.height ?? model.height ?? 0;
  if (width <= 0 || height <= 0) return null;

  const fontSize = model.a?.fontSize ?? model.fontSize ?? 0;
  const lineHeight =
    typeof model.lineHeight === "number" ? model.lineHeight : 1.2;
  // Canvas renders ``backgroundCornerRadius`` (already in fontSize-relative
  // units after the adapter) back to pixels as ``value * fontSize*lineHeight/2``.
  const factor = fontSize * lineHeight * 0.5;
  const cornerRadius = Math.max(
    0,
    Math.min(
      (model.backgroundCornerRadius ?? 0) * factor,
      Math.min(width, height) / 2,
    ),
  );

  const gradient = parseCssGradient(model.custom?.backgroundGradient);
  if (gradient) {
    return { type: "gradient", gradient, width, height, cornerRadius };
  }

  // Only multi-line badges need the notch-filling rect; a single line already
  // contours to a clean rectangle. The decomposer emits an explicit ``\n`` for
  // every multi-line badge, so key off that — a padded single-line pill has a
  // tall box too, and a height heuristic would wrongly treat it as multi-line.
  const text = String(model.text ?? "");
  const isMultiLine = text.includes("\n");
  if (
    model.backgroundEnabled === true &&
    !isTransparentColor(model.backgroundColor) &&
    isMultiLine
  ) {
    return {
      type: "solid",
      fill: String(model.backgroundColor),
      width,
      height,
      cornerRadius,
    };
  }

  return null;
}
