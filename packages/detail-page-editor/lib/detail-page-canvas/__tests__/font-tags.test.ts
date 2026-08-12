import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  EDITOR_BUNDLE_FONTS,
  EDITOR_CATALOG_FONTS,
  EDITOR_FONTS,
  filterFontsByTags,
  getEditorFont,
} from "../editor-fonts";
import {
  FONT_TAGS,
  isFontTag,
  toFontTags,
} from "../font-tags";

async function tagLabels(locale: string) {
  const branding = JSON.parse(
    await readFile(`public/locales/${locale}/branding.json`, "utf8"),
  ) as { detailPage: { fontTags: Record<string, string> } };
  return branding.detailPage.fontTags;
}

describe("font tags", () => {
  it("tags every font in the picker, from both sources", () => {
    for (const font of EDITOR_FONTS) {
      expect(font.tags.length, `${font.source}/${font.id} 태그 없음`).toBeGreaterThan(0);
      expect(font.tags.every(isFontTag)).toBe(true);
    }
    // 번들은 사이드카 파일에 적는다 — 패키지가 폰트를 늘리면 여기서 먼저 터져야 한다.
    expect(EDITOR_BUNDLE_FONTS.length).toBeGreaterThan(0);
    expect(EDITOR_CATALOG_FONTS.length).toBeGreaterThan(0);
  });

  it("leaves no chip that selects nothing", () => {
    for (const tag of FONT_TAGS) {
      expect(
        filterFontsByTags(EDITOR_FONTS, [tag]).length,
        `${tag} 칩에 걸리는 폰트가 없다`,
      ).toBeGreaterThan(0);
    }
  });

  it("narrows by every chosen chip, not any of them", () => {
    const rounded = filterFontsByTags(EDITOR_FONTS, ["rounded"]);
    const handwriting = filterFontsByTags(EDITOR_FONTS, ["handwriting"]);
    const both = filterFontsByTags(EDITOR_FONTS, ["handwriting", "rounded"]);

    expect(both.length).toBeLessThan(Math.min(rounded.length, handwriting.length));
    expect(both.every((font) => font.tags.includes("rounded"))).toBe(true);
    expect(both.map((font) => font.family)).toContain("Gaegu");
    // 펜 손글씨는 둥근 계열이 아니다 — OR 였다면 여기 남는다.
    expect(both.map((font) => font.family)).not.toContain("Nanum Pen Script");
  });

  it("treats no chip as the whole list", () => {
    expect(filterFontsByTags(EDITOR_FONTS, [])).toHaveLength(EDITOR_FONTS.length);
  });

  it("drops a tag the vocabulary does not know instead of showing it", () => {
    expect(toFontTags(["heading", "wobbly", 7, null])).toEqual(["heading"]);
    expect(toFontTags(undefined)).toEqual([]);
  });

  it("preserves the requested chips across bundled and CDN-only fonts", () => {
    expect(getEditorFont("Cafe24Decoline")?.tags).toContain("outline");
    expect(getEditorFont("SandollSamlipHobbangOutline")?.tags).toContain("outline");
    expect(getEditorFont("PalchilmmDailyItalic")?.tags).toContain("italic");
    expect(getEditorFont("OngleipParkDahyeon")?.tags).toContain("handwriting");
    expect(getEditorFont("NanumSquareRound")?.tags).toContain("rounded");
    expect(getEditorFont("BookkMyungjo")?.tags).toContain("myeongjo");
    expect(getEditorFont("Suit")?.tags).toContain("body");
    for (const family of [
      "Cafe24Decoline",
      "NanumSquareNeo",
      "NanumSquareRound",
      "SandollSamlipHobbangOutline",
      "Suit",
    ]) {
      expect(getEditorFont(family)?.source).toBe("bundle");
    }
    for (const family of ["BookkMyungjo", "OngleipParkDahyeon", "PalchilmmDailyItalic"]) {
      expect(getEditorFont(family)?.source).toBe("catalog");
    }
  });

});
