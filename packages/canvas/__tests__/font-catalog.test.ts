import { describe, expect, it } from "vitest";

import manifest from "../fonts/font-manifest.json";
import { FONT_CATALOG, catalogFont, matchFontFamily } from "../fonts/font-catalog";
import { resolveFontFamily } from "../fonts/font-coverage";

describe("catalog vs frozen bundle", () => {
  // The whole point of the catalog is that it and the bytes never drift. A family
  // listed but not frozen renders as a fallback font with different glyph widths,
  // which is exactly the wrap-mismatch class of bug the freeze exists to prevent.
  it("freezes every catalog family", () => {
    const frozen = new Set(manifest.faces.map((face) => face.family));
    const missing = FONT_CATALOG.filter((font) => !frozen.has(font.family));
    expect(missing.map((font) => font.family)).toEqual([]);
  });

  it("freezes every weight the catalog advertises", () => {
    const frozen = new Set(
      manifest.faces.map((face) => `${face.family}:${face.weight}`),
    );
    const missing = FONT_CATALOG.flatMap((font) =>
      font.weights
        .filter((weight) => !frozen.has(`${font.family}:${weight}`))
        .map((weight) => `${font.family}:${weight}`),
    );
    expect(missing).toEqual([]);
  });

  it("has no duplicate ids or families", () => {
    expect(new Set(FONT_CATALOG.map((f) => f.id)).size).toBe(FONT_CATALOG.length);
    expect(new Set(FONT_CATALOG.map((f) => f.family)).size).toBe(FONT_CATALOG.length);
  });
});

describe("matchFontFamily", () => {
  it("prefers an exact class+shape hit", () => {
    expect(matchFontFamily({ class: "handwriting", shape: "angular" })).toBe(
      "Nanum Brush Script",
    );
    expect(matchFontFamily({ class: "gothic", shape: "round" })).toBe("Gowun Dodum");
  });

  it("falls back within the class when the shape has no match", () => {
    const picked = matchFontFamily({ class: "myeongjo", shape: "pixel" });
    expect(catalogFont(picked)?.traits.class).toBe("myeongjo");
  });

  it("is deterministic — same query, same font", () => {
    const query = { class: "display", shape: "round" } as const;
    expect(matchFontFamily(query)).toBe(matchFontFamily(query));
  });

  it("returns the fallback when nothing is asked for", () => {
    expect(matchFontFamily({})).toBe("Pretendard");
  });
});

describe("resolveFontFamily", () => {
  it("keeps a real catalog family as-is", () => {
    expect(resolveFontFamily("Bagel Fat One")).toBe("Bagel Fat One");
  });

  it("reads trait descriptors from reference extraction", () => {
    expect(resolveFontFamily("gothic/round")).toBe("Gowun Dodum");
    expect(resolveFontFamily("handwriting")).toBe(
      matchFontFamily({ class: "handwriting" }),
    );
  });

  // Content written before the trait vocabulary existed still says "serif"/"sans".
  it("still honours the legacy serif/sans values", () => {
    expect(resolveFontFamily("serif")).toBe("Noto Serif KR");
    expect(resolveFontFamily("sans")).toBe("Pretendard");
    expect(resolveFontFamily(null)).toBe("Pretendard");
  });

  it("maps an unbundled family onto a bundled one instead of failing", () => {
    expect(resolveFontFamily("Georgia")).toBe("Noto Serif KR");
    expect(resolveFontFamily("Helvetica")).toBe("Pretendard");
  });
});
