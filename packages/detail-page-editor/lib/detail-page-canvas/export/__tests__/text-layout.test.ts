import { describe, expect, it } from "vitest";

import {
  cssFont,
  layoutText,
  normalizeFontWeight,
  resolveLeading,
  transformText,
  wrapText,
} from "../text-layout";

/** Deterministic measure: 10px per character. */
const measure = (s: string) => s.length * 10;

describe("normalizeFontWeight", () => {
  it("accepts numbers, numeric strings, and 'bold'", () => {
    expect(normalizeFontWeight({ fontWeight: 700 })).toBe(700);
    expect(normalizeFontWeight({ fontWeight: "600" })).toBe(600);
    expect(normalizeFontWeight({ fontStyle: "bold" })).toBe(700);
    expect(normalizeFontWeight({})).toBe(400);
  });
});

describe("cssFont", () => {
  it("renders a CSS shorthand with weight, size, family, and italic", () => {
    expect(cssFont({ fontWeight: 700, fontSize: 32, fontFamily: "Pretendard" })).toBe(
      "700 32px Pretendard",
    );
    expect(cssFont({ fontStyle: "italic", fontSize: 20 })).toBe("italic 400 20px Pretendard");
  });
});

describe("resolveLeading", () => {
  it("accepts multiplier, px string, bare string, and 'normal'", () => {
    expect(resolveLeading({ lineHeight: 1.5, fontSize: 20 })).toBe(30);
    expect(resolveLeading({ lineHeight: "75.6px", fontSize: 72 })).toBe(75.6);
    expect(resolveLeading({ lineHeight: "normal", fontSize: 20 })).toBe(24);
    expect(resolveLeading({ lineHeight: "1.4", fontSize: 10 })).toBe(14);
  });

  it("never returns NaN (regression: NaN leaked into PSD engineData)", () => {
    expect(Number.isFinite(resolveLeading({ lineHeight: "px" }))).toBe(true);
    expect(Number.isFinite(resolveLeading({}))).toBe(true);
  });
});

describe("transformText", () => {
  it("applies custom.textTransform", () => {
    expect(transformText({ text: "abc", custom: { textTransform: "uppercase" } })).toBe("ABC");
    expect(transformText({ text: "AbC" })).toBe("AbC");
  });
});

describe("wrapText", () => {
  it("wraps by word and breaks overlong CJK runs by character", () => {
    expect(wrapText("hello world", 60, measure)).toEqual(["hello", "world"]);
    expect(wrapText("ab\ncd", 100, measure)).toEqual(["ab", "cd"]);
    expect(wrapText("가나다라마바", 30, measure)).toEqual(["가나다", "라마바"]);
  });
});

describe("layoutText", () => {
  it("caps lines at the element height and condenses horizontally", () => {
    // 10 chars * 10px = 100px text in a 60px-wide, 1-line-tall box: wrapping
    // would need 2 lines, so the text condenses instead of overflowing.
    const layout = layoutText(
      { text: "abcde fghi", width: 60, height: 20, fontSize: 16, lineHeight: 1.25 },
      measure,
    );
    expect(layout.lines.length).toBe(1);
    expect(layout.scaleX).toBeLessThan(1);
  });

  it("applies verticalAlign as a first-line offset", () => {
    const layout = layoutText(
      {
        text: "ab",
        width: 100,
        height: 100,
        fontSize: 20,
        lineHeight: 1,
        verticalAlign: "middle",
      },
      measure,
    );
    expect(layout.offsetY).toBe(40); // (100 - 20) / 2
  });
});
