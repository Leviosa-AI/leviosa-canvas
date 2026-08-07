/**
 * Pure helpers for clipping HTML-decomposed decoration to its owning card
 * rectangle. Kept free of React/Polotno/Konva imports so both the native Konva
 * preview and the Polotno SDK clip-aware shape component can reuse them, and so
 * they stay trivially unit-testable.
 */

export type ClipRectShape = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
};

/** A minimal Konva.Context — only the path ops the clip needs. */
export type ClipContext = {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  closePath(): void;
};

/** Trace a rounded rectangle path used as the Konva clip region. */
export function roundedRectPath(
  ctx: ClipContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** Read a usable ``clipToRect`` off a Polotno element's ``custom`` payload. */
export function readClipRect(element: unknown): ClipRectShape | null {
  const custom =
    element && typeof element === "object"
      ? (element as { custom?: unknown }).custom
      : null;
  const clip =
    custom && typeof custom === "object"
      ? (custom as { clipToRect?: unknown }).clipToRect
      : null;
  if (!clip || typeof clip !== "object") return null;
  const rect = clip as Record<string, unknown>;
  const width = typeof rect.width === "number" ? rect.width : 0;
  const height = typeof rect.height === "number" ? rect.height : 0;
  if (!(width > 0) || !(height > 0)) return null;
  return {
    x: typeof rect.x === "number" ? rect.x : 0,
    y: typeof rect.y === "number" ? rect.y : 0,
    width,
    height,
    radius: typeof rect.radius === "number" ? rect.radius : 0,
  };
}
