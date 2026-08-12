/**
 * The vocabulary the font picker filters by — 눈누의 태그 방식을 우리 어휘로 추린 것.
 *
 * Two sources, two homes. Catalog fonts carry their tags inline in
 * `src/config/detail-page-fonts.json` (we own that file, so the tags sit next to
 * the label and the license they describe). Bundle fonts come from the konva
 * package, which we cannot edit, so their tags live in a sidecar keyed by font id.
 * A test asserts both sides are complete, so a package bump that adds a font fails
 * loudly instead of quietly shipping an untagged one.
 *
 * Order matters: the picker renders chips in this order.
 */

import bundleTagsJson from "../../config/detail-page-bundle-font-tags.json";

export const FONT_TAGS = [
  "heading",
  "body",
  "gothic",
  "myeongjo",
  "batang",
  "handwriting",
  "pixel",
  "rounded",
  "angular",
  "outline",
  "italic",
] as const;

export type FontTag = (typeof FONT_TAGS)[number];

const KNOWN = new Set<string>(FONT_TAGS);

export function isFontTag(value: unknown): value is FontTag {
  return typeof value === "string" && KNOWN.has(value);
}

/** Drops anything the vocabulary does not know — a stale tag must not crash a list. */
export function toFontTags(value: unknown): FontTag[] {
  return Array.isArray(value) ? value.filter(isFontTag) : [];
}

const bundleTags = bundleTagsJson as Record<string, string[]>;

export function bundleFontTags(id: string): FontTag[] {
  return toFontTags(bundleTags[id]);
}
