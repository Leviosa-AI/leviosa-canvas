import { fmt, utf16Hex } from "./writer";

/**
 * PDF text-showing operators for the Illustrator (.ai) exporter.
 *
 * Catalog fonts are embedded as subsets; legacy document fonts keep the
 * non-embedded Korean-CMap fallback. Both paths use explicit ``TJ`` corrections
 * so browser kerning, letter spacing and the stock editor's horizontal condensation stay
 * aligned with the editor.
 *
 * So each glyph carries its own correction. ``TJ`` takes a mixed array of
 * strings and numbers, where a number nudges the next glyph left by
 * thousandths of an em. Feeding it the advance we measured on canvas in the
 * real font makes the line land exactly where the editor draws it — and it
 * keeps working when Illustrator substitutes the font, because the positions
 * come from the file rather than from whatever font the machine has.
 */

export type ShowTextOptions = {
  /** Font resource name in the page's /Font dict, e.g. "F1". */
  fontRes: string;
  fontSize: number;
  /** Left edge of the text (alignment is resolved by the caller). */
  x: number;
  baseline: number;
  text: string;
  /** Advance of a string in the real font, in px at ``fontSize``. */
  measure: (text: string) => number;
  /** Horizontal condensation (Tz); matches the SVG exporter's scaleX. */
  scaleX?: number;
  /** Embedded fonts encode subset glyph IDs and supply their nominal widths. */
  glyph?: (char: string) => { hex: string; width: number } | null;
  /** Synthetic italic shear when only a normal source face exists. */
  skewX?: number;
};

/**
 * Advance of each character, in px, taken from prefix measurements so that
 * kerning between neighbours stays inside the running total (measuring each
 * character alone would drop it).
 */
export function charAdvances(text: string, measure: (t: string) => number): number[] {
  const chars = Array.from(text);
  const advances: number[] = [];
  let previous = 0;
  for (let i = 0; i < chars.length; i++) {
    const width = measure(chars.slice(0, i + 1).join(""));
    advances.push(width - previous);
    previous = width;
  }
  return advances;
}

export function showTextOps(opts: ShowTextOptions): string[] {
  const { fontRes, fontSize, x, baseline, text } = opts;
  if (!text || fontSize <= 0) return [];
  const scaleX = opts.scaleX && opts.scaleX > 0 ? opts.scaleX : 1;
  const chars = Array.from(text);
  const advances = charAdvances(text, opts.measure);

  const parts: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const encoded = opts.glyph?.(chars[i]);
    const nominalWidth = encoded?.width ?? 1000;
    parts.push(`<${encoded?.hex ?? utf16Hex(chars[i])}>`);
    // Subtract the browser-measured advance from the embedded (or fallback)
    // nominal width. PDF TJ numbers move the next glyph left in 1/1000 em.
    const adjust = nominalWidth - (advances[i] / fontSize) * 1000;
    if (Math.abs(adjust) > 0.5) parts.push(fmt(adjust));
  }

  return [
    "BT",
    `/${fontRes} ${fmt(fontSize)} Tf`,
    ...(scaleX !== 1 ? [`${fmt(scaleX * 100)} Tz`] : []),
    // The page CTM is flipped to y-down; the -1 flips text back upright.
    `1 0 ${fmt(opts.skewX ?? 0)} -1 ${fmt(x)} ${fmt(baseline)} Tm`,
    `[${parts.join(" ")}] TJ`,
    "ET",
  ];
}
