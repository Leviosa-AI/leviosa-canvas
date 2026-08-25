/**
 * One list for the detail-page font picker, over two very different sources.
 *
 *   catalog — src/config/detail-page-fonts.json. Whole woff2 files fetched from a
 *             public CDN on demand, one file per (family, weight).
 *   bundle  — the konva font catalog, frozen under /render-fonts. It contains both
 *             Google's unicode-range slices and licensed whole files, all served
 *             from our origin. These are the bytes the server-side renderer draws with.
 *
 * The editor already loaded both — the bundle families just had no way into the
 * picker, so they were reachable only by a template naming them. This module is
 * the join: same shape, same weight lookup, one loader.
 *
 * Caveat: `.ai`/PSD export embeds glyphs for catalog families only — `font-subset`
 * needs one whole file per face, and a bundle family is ~90 unicode-range slices.
 * A bundle family exports with Illustrator's fallback, exactly as it already did
 * when a template named one; the picker just makes it reachable by hand too.
 *
 * Families are unique across the merged list. When both sources ship the same
 * family (Paperozi, Presentation, Diphylleia), the catalog entry wins — it is the
 * one `getDetailPageFont` already resolves first everywhere else, so preferring it
 * keeps the picker honest about which bytes the canvas will actually draw.
 */

import { editorAssetBase } from "../detail-page/runtime-config";
import { ALL_FONT_OPTIONS, loadFontFaces } from "../cardnews/font-loader";

import {
  DETAIL_PAGE_FONTS,
  getDetailPageFontWeights,
  loadDetailPageFont,
  normalizeFontWeight,
  type FontCatalogStore,
} from "./font-catalog";
import { bundleFontTags, toFontTags, type FontTag } from "./font-tags";

export type EditorFontSource = "catalog" | "bundle";

export type EditorFont = {
  source: EditorFontSource;
  id: string;
  family: string;
  label: string;
  /** Searchable Latin name — the CDN catalog carries one, the bundle uses `family`. */
  labelEn: string;
  /** Static WebP rendered at build time; the picker never downloads font bytes. */
  previewSrc: string;
  /** 피커 칩이 거르는 분류. 카탈로그는 항목 안에, 번들은 사이드카에 적혀 있다. */
  tags: FontTag[];
  weights: number[];
  /** No Hangul glyphs — applying it to Korean silently falls back to a system font. */
  latinOnly?: boolean;
  licenseName: string;
  licenseUrl: string;
  licenseNoteKey?: string;
};

function fromCatalog(font: (typeof DETAIL_PAGE_FONTS)[number]): EditorFont {
  return {
    source: "catalog",
    id: font.id,
    family: font.family,
    label: font.label,
    labelEn: font.labelEn,
    previewSrc: `${editorAssetBase("detailFontPreviews")}/${font.id}.webp`,
    tags: toFontTags(font.tags),
    weights: getDetailPageFontWeights(font),
    licenseName: font.licenseName,
    licenseUrl: font.licenseUrl,
    licenseNoteKey: font.licenseNoteKey,
  };
}

function fromBundle(font: (typeof ALL_FONT_OPTIONS)[number]): EditorFont {
  return {
    source: "bundle",
    id: font.id,
    family: font.family,
    label: font.label,
    labelEn: font.family,
    previewSrc: `${editorAssetBase("cardnewsFontPreviews")}/${font.id}.webp`,
    tags: bundleFontTags(font.id),
    weights: [...font.weights].sort((a, b) => a - b),
    latinOnly: (font as { latinOnly?: boolean }).latinOnly,
    licenseName: font.license.name,
    licenseUrl: font.license.url,
  };
}

const catalogFonts = DETAIL_PAGE_FONTS.map(fromCatalog);
const catalogFamilies = new Set(catalogFonts.map((font) => font.family));

export const EDITOR_CATALOG_FONTS: EditorFont[] = catalogFonts;

export const EDITOR_BUNDLE_FONTS: EditorFont[] = ALL_FONT_OPTIONS.filter(
  (font) => !catalogFamilies.has(font.family),
).map(fromBundle);

export const EDITOR_FONTS: EditorFont[] = [
  ...EDITOR_CATALOG_FONTS,
  ...EDITOR_BUNDLE_FONTS,
];

/**
 * AND, not OR — chips are for narrowing. "제목용" alone is still 20-odd fonts;
 * "제목용 + 둥근" is the handful the user actually meant. An empty selection is
 * the whole list, so the picker never has to special-case "no filter".
 */
export function filterFontsByTags(
  fonts: EditorFont[],
  tags: readonly FontTag[],
): EditorFont[] {
  if (!tags.length) return fonts;
  return fonts.filter((font) => tags.every((tag) => font.tags.includes(tag)));
}

const byFamily = new Map(EDITOR_FONTS.map((font) => [font.family, font] as const));

export function getEditorFont(family: string): EditorFont | undefined {
  return byFamily.get(family);
}

export function closestEditorFontWeight(
  font: EditorFont,
  requested: unknown,
): number {
  const target = normalizeFontWeight(requested);
  return font.weights.reduce((best, weight) =>
    Math.abs(weight - target) < Math.abs(best - target) ? weight : best,
  );
}

/**
 * Registers the one face about to be drawn. Catalog fonts also get pushed into the
 * Canvas store so the family survives a save/reload; bundle families are already
 * declared by the frozen stylesheet, so installing the face is all they need.
 */
export async function loadEditorFont({
  family,
  weight,
  sample,
  store,
}: {
  family: string;
  weight: unknown;
  sample?: string;
  store?: FontCatalogStore;
}): Promise<void> {
  const font = getEditorFont(family);
  if (!font) return;
  if (font.source === "catalog") {
    await loadDetailPageFont({ family, weight, sample, store });
    return;
  }
  await loadFontFaces([
    {
      family,
      weight: String(closestEditorFontWeight(font, weight)),
      sample: sample || undefined,
    },
  ]);
}
