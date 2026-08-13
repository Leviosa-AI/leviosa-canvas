import { describe, expect, it } from "vitest";

import { planTextBackground } from "../text-background-plan";

/** A Canvas text model as the SDK shape component receives it (``a`` mirrors x/y/size). */
function textModel(overrides: Record<string, unknown>) {
  const base = {
    text: "badge",
    fontSize: 20,
    lineHeight: 1.2,
    width: 120,
    height: 40,
    backgroundEnabled: false,
    backgroundColor: "rgba(0,0,0,0)",
    backgroundCornerRadius: 0,
    custom: {},
    ...overrides,
  };
  return {
    ...base,
    a: {
      x: 10,
      y: 20,
      width: base.width,
      height: base.height,
      rotation: 0,
      opacity: 1,
      fontSize: base.fontSize,
    },
  };
}

describe("planTextBackground", () => {
  it("plans a gradient rect for a highlight band (custom.backgroundGradient)", () => {
    const plan = planTextBackground(
      textModel({
        // solution-3 "깨어있을 수 있어": transparent solid, real colour in the gradient.
        backgroundEnabled: true,
        backgroundColor: "rgba(0,0,0,0)",
        custom: {
          backgroundGradient:
            "linear-gradient(rgba(0, 0, 0, 0) 60%, rgb(123, 214, 255) 60%)",
        },
      }),
    );
    expect(plan?.type).toBe("gradient");
    if (plan?.type !== "gradient") throw new Error("expected gradient plan");
    expect(plan.gradient.type).toBe("linear");
    // The blue stop survives so the band can actually paint.
    expect(plan.gradient.stops.map((s) => s.color)).toContain(
      "rgb(123, 214, 255)",
    );
    expect(plan.width).toBe(120);
    expect(plan.height).toBe(40);
  });

  it("plans a solid notch-filling rect for a multi-line badge", () => {
    const plan = planTextBackground(
      textModel({
        // hero-text-10 "🎒 책가방에\n쏙!": two lines, left aligned, solid fill.
        text: "🎒 책가방에\n쏙!",
        fontSize: 22,
        width: 147,
        height: 88,
        backgroundEnabled: true,
        backgroundColor: "rgb(123, 214, 255)",
        backgroundCornerRadius: 18 / (22 * 1.2 * 0.5), // adapter's relative units
      }),
    );
    expect(plan?.type).toBe("solid");
    if (plan?.type !== "solid") throw new Error("expected solid plan");
    expect(plan.fill).toBe("rgb(123, 214, 255)");
    // Relative radius resolves back to the original ~18px (capped well under h/2).
    expect(plan.cornerRadius).toBeCloseTo(18, 5);
  });

  it("leaves a single-line solid pill to the stock contour (no rect)", () => {
    const plan = planTextBackground(
      textModel({
        // hero-text-3 pill: one line, already a clean rect via the stock contour.
        text: "🍬 시험기간 필수템",
        fontSize: 18,
        width: 163,
        height: 40,
        backgroundEnabled: true,
        backgroundColor: "rgb(123, 214, 255)",
        backgroundCornerRadius: 999,
      }),
    );
    expect(plan).toBeNull();
  });

  it("leaves plain text (no background, no gradient) untouched", () => {
    expect(
      planTextBackground(textModel({ text: "그냥 본문\n두 줄" })),
    ).toBeNull();
  });

  it("ignores a multi-line element whose background is transparent with no gradient", () => {
    const plan = planTextBackground(
      textModel({
        text: "두\n줄",
        height: 90,
        backgroundEnabled: true,
        backgroundColor: "rgba(0,0,0,0)",
      }),
    );
    expect(plan).toBeNull();
  });
});
