import { describe, expect, it } from "vitest";

import {
  computeHighlightBands,
  isTransparentColor,
  lineHeightRatioFor,
} from "../paint/text-highlight-bands";

describe("isTransparentColor", () => {
  it("treats transparent keywords and zero-alpha rgba as transparent", () => {
    expect(isTransparentColor("transparent")).toBe(true);
    expect(isTransparentColor("rgba(0,0,0,0)")).toBe(true);
    expect(isTransparentColor("rgba(123, 214, 255, 0)")).toBe(true);
    expect(isTransparentColor("")).toBe(true);
    expect(isTransparentColor(undefined)).toBe(true);
  });

  it("treats opaque colours as not transparent", () => {
    expect(isTransparentColor("rgb(123, 214, 255)")).toBe(false);
    expect(isTransparentColor("rgba(0,0,0,0.5)")).toBe(false);
    expect(isTransparentColor("#7bd6ff")).toBe(false);
  });
});

describe("lineHeightRatioFor", () => {
  it("passes a numeric ratio through", () => {
    expect(lineHeightRatioFor(1.5, 16)).toBe(1.5);
  });
  it("converts a px string against the font size", () => {
    expect(lineHeightRatioFor("30.78px", 16)).toBeCloseTo(1.92375, 4);
  });
  it("falls back to 1.2 for junk", () => {
    expect(lineHeightRatioFor("normal", 16)).toBe(1.2);
    expect(lineHeightRatioFor(undefined, 16)).toBe(1.2);
  });
});

describe("computeHighlightBands", () => {
  const base = {
    fontSize: 16,
    fontFamily: "Arial",
    lineHeightRatio: 1.9,
    color: "#7ED321",
  };

  it("paints one band per wrapped visual line, hugging each line's width", () => {
    // A long single logical line that must wrap inside a narrow box.
    const bands = computeHighlightBands({
      ...base,
      text: "0.8mm 슬림 프로파일에 코너 에어쿠션을 더한 반투명 케이스",
      boxWidth: 200,
      align: "left",
    });
    expect(bands.length).toBeGreaterThanOrEqual(2);
    // Bands stack vertically with a gap: each band is shorter than the line box
    // (fontSize*lineHeight) so wrapped lines don't merge into a solid block.
    const lineBox = base.fontSize * base.lineHeightRatio;
    for (const b of bands) expect(b.height).toBeLessThan(lineBox);
    // Consecutive bands are separated (top of line 2 > bottom of line 1).
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].y).toBeGreaterThan(bands[i - 1].y + bands[i - 1].height);
    }
  });

  it("centers each band under a center-aligned line", () => {
    const boxWidth = 300;
    const [band] = computeHighlightBands({
      ...base,
      text: "가운데",
      boxWidth,
      align: "center",
    });
    // Symmetric: left inset ≈ right inset within the box.
    const leftInset = band.x;
    const rightInset = boxWidth - (band.x + band.width);
    expect(Math.abs(leftInset - rightInset)).toBeLessThan(1);
  });

  it("right-aligns the band to the box's right edge", () => {
    const boxWidth = 300;
    const [band] = computeHighlightBands({
      ...base,
      text: "오른쪽",
      boxWidth,
      align: "right",
    });
    // Band's right edge sits at (or just past) the box's right edge.
    expect(band.x + band.width).toBeGreaterThan(boxWidth - 2);
  });

  it("returns no bands for a transparent colour", () => {
    expect(
      computeHighlightBands({ ...base, text: "x", boxWidth: 200, color: "transparent" }),
    ).toEqual([]);
  });
});
