import { beforeEach, describe, expect, it, vi } from "vitest";

const loadFontFaces = vi.fn().mockResolvedValue(undefined);
const loadDetailPageFont = vi.fn().mockResolvedValue(null);

vi.mock("../../cardnews/font-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../cardnews/font-loader")>()),
  loadFontFaces,
}));
vi.mock("../font-catalog", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../font-catalog")
  >()),
  loadDetailPageFont,
}));

const {
  EDITOR_BUNDLE_FONTS,
  EDITOR_CATALOG_FONTS,
  EDITOR_FONTS,
  closestEditorFontWeight,
  getEditorFont,
  loadEditorFont,
} = await import("../editor-fonts");

describe("editor font list", () => {
  beforeEach(() => {
    loadFontFaces.mockClear();
    loadDetailPageFont.mockClear();
  });

  it("merges both sources without a duplicate family", () => {
    const families = EDITOR_FONTS.map((font) => font.family);
    expect(new Set(families).size).toBe(families.length);
    expect(EDITOR_FONTS).toHaveLength(
      EDITOR_CATALOG_FONTS.length + EDITOR_BUNDLE_FONTS.length,
    );
    // Bundled workhorses the picker could not reach before.
    expect(families).toEqual(
      expect.arrayContaining([
        "Pretendard",
        "Noto Serif KR",
        "Gowun Batang",
        "Nanum Myeongjo",
        "Gaegu",
      ]),
    );
  });

  it("lets the catalog win a family both sources ship", () => {
    // Both catalogs carry these; the CDN entry ships more weights and is what
    // `getDetailPageFont` resolves everywhere else, so it must be the one listed.
    for (const family of ["Paperozi", "Presentation", "Diphylleia"]) {
      expect(getEditorFont(family)?.source).toBe("catalog");
      expect(EDITOR_BUNDLE_FONTS.some((font) => font.family === family)).toBe(
        false,
      );
    }
  });

  it("가중치는 정렬돼 있고 라이선스 주소가 있다", () => {
    for (const font of EDITOR_FONTS) {
      expect(font.weights.length).toBeGreaterThan(0);
      expect([...font.weights].sort((a, b) => a - b)).toEqual(font.weights);
      expect(font.licenseUrl).toMatch(/^https?:\/\//);
    }
  });

  it("snaps a requested weight to one the family actually ships", () => {
    const notoSerif = getEditorFont("Noto Serif KR")!;
    expect(notoSerif.weights).toContain(200);
    expect(closestEditorFontWeight(notoSerif, 100)).toBe(200);
    expect(closestEditorFontWeight(notoSerif, "bold")).toBe(700);
  });

  it("routes each source to its own loader", async () => {
    await loadEditorFont({ family: "Paperozi", weight: 600, sample: "가" });
    expect(loadDetailPageFont).toHaveBeenCalledTimes(1);
    expect(loadFontFaces).not.toHaveBeenCalled();

    await loadEditorFont({ family: "Nanum Myeongjo", weight: 500, sample: "가" });
    expect(loadDetailPageFont).toHaveBeenCalledTimes(1);
    // Nanum Myeongjo ships 400/700/800 — asking for 500 must not request a
    // family+weight stylesheet that does not exist.
    expect(loadFontFaces).toHaveBeenCalledWith([
      { family: "Nanum Myeongjo", weight: "400", sample: "가" },
    ]);

    await loadEditorFont({ family: "Suit", weight: 500, sample: "가" });
    expect(loadDetailPageFont).toHaveBeenCalledTimes(1);
    expect(loadFontFaces).toHaveBeenLastCalledWith([
      { family: "Suit", weight: "500", sample: "가" },
    ]);
  });

  it("ignores a family neither source knows", async () => {
    await loadEditorFont({ family: "Comic Sans MS", weight: 400 });
    expect(loadDetailPageFont).not.toHaveBeenCalled();
    expect(loadFontFaces).not.toHaveBeenCalled();
  });
});
