// Typed view over fonts/catalog.json — the SSOT for which fonts exist.
//
// Before this, the font list was copy-pasted in four places (this package's coverage
// set + weight table, and two lists in leviosa-frontend). Adding a font meant editing
// all four and the bundle, and missing one silently degraded rendering. Everything now
// derives from the catalog; adding a font is one entry + a re-freeze.

import catalogJson from "./catalog.json" with { type: "json" };

/** Broad shape of the letterforms. Coarse on purpose — a reference image only
 *  supports a coarse read, and a finer vocabulary would just invite guessing. */
export type FontClass = "gothic" | "myeongjo" | "handwriting" | "display";
export type FontShape = "neutral" | "round" | "angular" | "narrow" | "pixel";
export type FontCategory = "sans" | "serif" | "display" | "handwriting";

export interface CatalogFont {
  id: string;
  family: string;
  /** Korean display name for the picker. */
  label: string;
  category: FontCategory;
  traits: { class: FontClass; shape: FontShape };
  weights: number[];
  license: { name: string; url: string };
  previewText: string;
}

export const FONT_CATALOG: CatalogFont[] = (
  catalogJson as { fonts: CatalogFont[] }
).fonts;

export const FONT_FAMILIES: string[] = FONT_CATALOG.map((font) => font.family);

const BY_FAMILY = new Map(FONT_CATALOG.map((font) => [font.family, font] as const));

export function catalogFont(family: string | null | undefined): CatalogFont | undefined {
  return family ? BY_FAMILY.get(family.trim()) : undefined;
}

export function fontWeights(family: string | null | undefined): number[] {
  return catalogFont(family)?.weights ?? [100, 200, 300, 400, 500, 600, 700, 800, 900];
}

// ── trait matching ───────────────────────────────────────────────────────────

export interface FontTraitQuery {
  class?: FontClass | null;
  shape?: FontShape | null;
  /** Numeric weight the design needs; a family that actually has it wins ties. */
  weight?: number | null;
}

/**
 * Pick the catalog family that best fits a coarse description of some lettering.
 * Fully deterministic: fixed scores, catalog order breaks ties, so the same read
 * of a reference always yields the same font.
 */
export function matchFontFamily(query: FontTraitQuery, fallback = "Pretendard"): string {
  if (!query.class && !query.shape) return fallback;
  let best: { family: string; score: number } | null = null;
  for (const font of FONT_CATALOG) {
    let score = 0;
    if (query.class) score += font.traits.class === query.class ? 10 : -10;
    if (query.shape) score += font.traits.shape === query.shape ? 4 : 0;
    // A family that really has the requested weight beats one that would be
    // snapped to its nearest available weight.
    if (query.weight != null && font.weights.includes(query.weight)) score += 2;
    if (!best || score > best.score) best = { family: font.family, score };
  }
  // Nothing in the catalog matched the class at all — don't return a random family.
  return best && best.score > 0 ? best.family : fallback;
}
