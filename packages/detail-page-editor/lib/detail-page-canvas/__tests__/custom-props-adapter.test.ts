import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_IMAGE_PLACEHOLDER_SRC,
  applyTextLineFit,
  clearPlaceholderImageSrc,
} from "../custom-props-adapter";

/** Stub canvas text measurement so the fit pass sees a deterministic width.
 * Honours ``letterSpacing`` (px string, as the measurer sets it) the way a real
 * canvas does: each glyph's advance is nudged by the spacing. */
function stubTextMeasure(pixelsPerChar: number) {
  const ctx = {
    font: "",
    letterSpacing: "0px",
    measureText(text: string) {
      const ls = parseFloat(this.letterSpacing) || 0;
      return { width: text.length * pixelsPerChar + ls * text.length };
    },
  };
  return vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
}

describe("clearPlaceholderImageSrc", () => {
  it("reverts placeholder src back to empty, leaving real sources intact", () => {
    const cleared = clearPlaceholderImageSrc({
      pages: [
        {
          id: "hero",
          children: [
            { id: "ph", type: "image", src: EMPTY_IMAGE_PLACEHOLDER_SRC },
            { id: "real", type: "image", src: "https://cdn.example.com/p.jpg" },
            {
              id: "group",
              type: "group",
              children: [
                { id: "nested-ph", type: "image", src: EMPTY_IMAGE_PLACEHOLDER_SRC },
              ],
            },
          ],
        },
      ],
    });

    const [ph, real, group] = cleared.pages[0].children as Array<
      Record<string, unknown>
    >;
    expect(ph.src).toBe("");
    expect(real.src).toBe("https://cdn.example.com/p.jpg");
    const nested = (group.children as Array<Record<string, unknown>>)[0];
    expect(nested.src).toBe("");
  });

  it("reverts a promoted mockup src (matching its own placeholderBgImage) to empty", () => {
    const cleared = clearPlaceholderImageSrc({
      pages: [
        {
          id: "hero",
          children: [
            {
              id: "mockup",
              type: "image",
              src: "/dev-fixtures/hero_bottle.png",
              custom: {
                placeholderBgImage: 'url("/dev-fixtures/hero_bottle.png")',
              },
            },
            {
              id: "filled",
              type: "image",
              src: "https://cdn.example.com/generated.jpg",
              custom: {
                placeholderBgImage: 'url("/dev-fixtures/hero_bottle.png")',
              },
            },
          ],
        },
      ],
    });

    const [mockup, filled] = cleared.pages[0].children as Array<
      Record<string, unknown>
    >;
    // An unfilled slot showing its own mockup is reverted to empty...
    expect(mockup.src).toBe("");
    // ...but a slot the seller actually filled keeps the real generated image.
    expect(filled.src).toBe("https://cdn.example.com/generated.jpg");
  });
});

describe("applyTextLineFit", () => {
  afterEach(() => vi.restoreAllMocks());

  /** A live-store-like element that records set() patches. */
  function textEl(props: Record<string, unknown>): Record<string, unknown> {
    const patches: Array<Record<string, number>> = [];
    const el: Record<string, unknown> = {
      type: "text",
      align: "left",
      ...props,
      patches,
    };
    el.set = (patch: Record<string, number>) => {
      Object.assign(el, patch);
      patches.push(patch);
    };
    return el;
  }

  it("widens a box that wraps by a hair under the loaded font", () => {
    // "피지 때문에 유분은" = 10 chars * 12px = 120 + slack -> ~123, box 118.
    stubTextMeasure(12);
    const el = textEl({ text: "피지 때문에 유분은", width: 118, fontSize: 20 });
    applyTextLineFit({ pages: [{ children: [el] }] });
    expect(el.width as number).toBeGreaterThan(118);
    expect(el.patches as unknown[]).toHaveLength(1);
  });

  it("shifts x to keep a centred box anchored when widening", () => {
    stubTextMeasure(12);
    const el = textEl({
      text: "피지 때문에 유분은",
      width: 118,
      x: 100,
      fontSize: 20,
      align: "center",
    });
    applyTextLineFit({ pages: [{ children: [el] }] });
    const grow = (el.width as number) - 118;
    expect(el.x as number).toBeCloseTo(100 - grow / 2, 3);
  });

  it("leaves a box that already fits alone", () => {
    stubTextMeasure(4); // short measured width < box
    const el = textEl({ text: "짧다", width: 200, fontSize: 20 });
    applyTextLineFit({ pages: [{ children: [el] }] });
    expect(el.width as number).toBe(200);
    expect(el.patches as unknown[]).toHaveLength(0);
  });

  it("does not unwrap a flowing paragraph (overflow beyond the drift cap)", () => {
    stubTextMeasure(30); // huge measured width >> box -> exceeds maxGrow
    const el = textEl({
      text: "아주 긴 문단이 박스보다 훨씬 넓게 측정되는 경우",
      width: 120,
      fontSize: 18,
    });
    applyTextLineFit({ pages: [{ children: [el] }] });
    expect(el.width as number).toBe(120); // untouched
    expect(el.patches as unknown[]).toHaveLength(0);
  });

  it("does not widen a SHORT flowing paragraph even when the overflow is under the cap", () => {
    // The FAQ/warranty regression: no "\n", box taller than one line -> a wrap
    // paragraph. Its whole text measures just over the box (grow < cap), which the
    // cap alone would widen — collapsing the two-line wrap into one overflowing line.
    stubTextMeasure(16);
    const el = textEl({
      text: "두 줄로 감기는 짧은 문단입니다",
      width: 200,
      height: 58, // > one 18px line -> wrapping paragraph
      fontSize: 18,
    });
    applyTextLineFit({ pages: [{ children: [el] }] });
    expect(el.width as number).toBe(200); // untouched, wrap preserved
    expect(el.patches as unknown[]).toHaveLength(0);
  });

  it("still widens a SINGLE-LINE box that drifts (height ~ one line)", () => {
    stubTextMeasure(16);
    const el = textEl({
      text: "한 줄 텍스트",
      width: 90,
      height: 24, // ~ one line -> not a flowing paragraph, drift fix applies
      fontSize: 18,
    });
    applyTextLineFit({ pages: [{ children: [el] }] });
    expect(el.width as number).toBeGreaterThan(90);
  });
});
