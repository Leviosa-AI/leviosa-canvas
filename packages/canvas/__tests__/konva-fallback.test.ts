import { describe, expect, it } from "vitest";

import {
  linearGradientKonvaProps,
  normalizeCanvasJsonForKonva,
  parseCssGradient,
  parseCssGradientLayers,
  parseCssShadow,
  radialGradientKonvaProps,
} from "../paint/konva-fallback";

describe("text background gradient (custom.backgroundGradient)", () => {
  it("parses a highlight band onto the text element's backgroundGradient", () => {
    const [page] = normalizeCanvasJsonForKonva({
      pages: [
        {
          id: "p",
          children: [
            {
              id: "hl",
              type: "text",
              text: "깨어있을 수 있어",
              backgroundEnabled: true,
              backgroundColor: "rgba(0,0,0,0)",
              custom: {
                backgroundGradient:
                  "linear-gradient(rgba(0, 0, 0, 0) 60%, rgb(123, 214, 255) 60%)",
              },
            },
          ],
        },
      ],
    });
    const el = page.elements[0];
    expect(el.backgroundGradient?.type).toBe("linear");
    expect(el.backgroundGradient?.stops.map((s) => s.color)).toContain(
      "rgb(123, 214, 255)",
    );
  });

  it("builds a vertical (180deg) Konva linear gradient across the box", () => {
    const props = linearGradientKonvaProps(
      { type: "linear", angle: 180, stops: [
        { offset: 0.6, color: "rgba(0,0,0,0)" },
        { offset: 0.6, color: "rgb(123, 214, 255)" },
      ] },
      100,
      40,
    );
    // 180deg = top -> bottom: start at the top-center, end at the bottom-center.
    expect(props.fillLinearGradientStartPoint.x).toBeCloseTo(50, 5);
    expect(props.fillLinearGradientStartPoint.y).toBeCloseTo(0, 5);
    expect(props.fillLinearGradientEndPoint.x).toBeCloseTo(50, 5);
    expect(props.fillLinearGradientEndPoint.y).toBeCloseTo(40, 5);
    expect(props.fillLinearGradientColorStops).toEqual([
      0.6,
      "rgba(0,0,0,0)",
      0.6,
      "rgb(123, 214, 255)",
    ]);
  });
});

describe("normalizeCanvasJsonForKonva", () => {
  it("normalizes Canvas pages and supported element types for native Konva", () => {
    const pages = normalizeCanvasJsonForKonva({
      width: 750,
      height: 1200,
      background: "#fafafa",
      pages: [
        {
          id: "hero",
          height: 900,
          children: [
            {
              id: "title",
              type: "text",
              x: 48,
              y: 80,
              width: 654,
              height: 96,
              text: "Premium Bottle",
              fontSize: 42,
              fill: "#111111",
              align: "center",
              custom: { leviosaSlot: "hero.title" },
            },
            {
              id: "photo",
              type: "image",
              x: 60,
              y: 220,
              width: 630,
              height: 520,
              src: "https://cdn.example.com/bottle.png",
              custom: { leviosaSlot: "hero.image" },
            },
            {
              id: "accent",
              type: "figure",
              subType: "rect",
              x: 0,
              y: 0,
              width: 750,
              height: 12,
              fill: "#0f766e",
            },
          ],
        },
      ],
    });

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      id: "hero",
      width: 750,
      height: 900,
      background: "#fafafa",
    });
    expect(pages[0]?.elements).toMatchObject([
      {
        id: "title",
        kind: "text",
        text: "Premium Bottle",
        fontSize: 42,
        align: "center",
        slot: "hero.title",
      },
      {
        id: "photo",
        kind: "image",
        src: "https://cdn.example.com/bottle.png",
        slot: "hero.image",
      },
      {
        id: "accent",
        kind: "rect",
        fill: "#0f766e",
      },
    ]);
  });

  it("carries text badge background props (in pixels) and vertical align", () => {
    const [page] = normalizeCanvasJsonForKonva({
      pages: [
        {
          id: "hero",
          height: 900,
          children: [
            {
              id: "badge",
              type: "text",
              x: 48,
              y: 96,
              width: 163,
              height: 40,
              text: "🍬 시험기간 필수템",
              fontSize: 18,
              lineHeight: 1.2,
              fill: "rgb(58, 26, 58)",
              verticalAlign: "center",
              backgroundEnabled: true,
              backgroundColor: "rgb(123, 214, 255)",
              backgroundPadding: 14,
              backgroundCornerRadius: 999,
            },
            {
              id: "plain",
              type: "text",
              x: 48,
              y: 150,
              width: 394,
              height: 86,
              text: "졸린 자습시간,",
              fontSize: 72,
            },
          ],
        },
      ],
    });

    const [badge, plain] = page.elements;
    expect(badge).toMatchObject({
      backgroundEnabled: true,
      backgroundColor: "rgb(123, 214, 255)",
      backgroundPadding: 14,
      backgroundCornerRadius: 999,
      // "center" is the stock editor's name for what Konva calls "middle".
      verticalAlign: "middle",
      lineHeight: 1.2,
    });
    // A plain text element defaults to no background and top alignment.
    expect(plain).toMatchObject({
      backgroundEnabled: false,
      verticalAlign: "top",
    });
  });

  it("returns a blank page fallback when JSON has no pages", () => {
    const pages = normalizeCanvasJsonForKonva({ width: 750, height: 900 });

    expect(pages).toEqual([
      {
        id: "page-1",
        width: 750,
        height: 900,
        background: "#ffffff",
        elements: [],
      },
    ]);
  });

  it("extracts cornerRadius, gradient, shadow and clipToRect from custom", () => {
    const [page] = normalizeCanvasJsonForKonva({
      pages: [
        {
          id: "solution",
          height: 900,
          children: [
            {
              id: "panel",
              type: "figure",
              subType: "rect",
              x: 24,
              y: 40,
              width: 702,
              height: 240,
              cornerRadius: 28,
              custom: {
                gradient: "linear-gradient(135deg, rgb(234, 214, 255), rgb(166, 116, 232))",
                shadow: "rgb(255, 229, 116) 4px 4px 0px 0px",
              },
            },
            {
              id: "circle",
              type: "figure",
              subType: "rect",
              x: 602,
              y: 425,
              width: 120,
              height: 120,
              cornerRadius: 60,
              custom: {
                clipToRect: { x: 48, y: 345, width: 654, height: 180, radius: 24 },
              },
            },
          ],
        },
      ],
    });

    const [panel, circle] = page.elements;
    expect(panel.cornerRadius).toBe(28);
    expect(panel.gradient).toEqual({
      type: "linear",
      angle: 135,
      stops: [
        { offset: 0, color: "rgb(234, 214, 255)" },
        { offset: 1, color: "rgb(166, 116, 232)" },
      ],
    });
    expect(panel.shadow).toEqual({
      color: "rgb(255, 229, 116)",
      offsetX: 4,
      offsetY: 4,
      blur: 0,
    });
    expect(circle.cornerRadius).toBe(60);
    expect(circle.clipToRect).toEqual({
      x: 48,
      y: 345,
      width: 654,
      height: 180,
      radius: 24,
    });
  });
});

describe("parseCssGradient", () => {
  it("parses a linear gradient with an angle and two implicit stops", () => {
    expect(
      parseCssGradient("linear-gradient(135deg, rgb(255, 229, 116), rgb(255, 184, 77))"),
    ).toEqual({
      type: "linear",
      angle: 135,
      stops: [
        { offset: 0, color: "rgb(255, 229, 116)" },
        { offset: 1, color: "rgb(255, 184, 77)" },
      ],
    });
  });

  it("defaults a directionless linear gradient to 180deg", () => {
    const gradient = parseCssGradient("linear-gradient(#fff, #000)");
    expect(gradient).toMatchObject({ type: "linear", angle: 180 });
  });

  it("parses a radial gradient with focal point and explicit stops", () => {
    expect(
      parseCssGradient(
        "radial-gradient(circle at 70% 30%, rgb(255, 189, 223) 0%, rgb(255, 78, 154) 55%, rgb(58, 26, 58) 100%)",
      ),
    ).toEqual({
      type: "radial",
      cx: 0.7,
      cy: 0.3,
      stops: [
        { offset: 0, color: "rgb(255, 189, 223)" },
        { offset: 0.55, color: "rgb(255, 78, 154)" },
        { offset: 1, color: "rgb(58, 26, 58)" },
      ],
    });
  });

  it("returns null for non-gradient values", () => {
    expect(parseCssGradient("none")).toBeNull();
    expect(parseCssGradient("#ffffff")).toBeNull();
    expect(parseCssGradient(undefined)).toBeNull();
  });

  it("takes only the first layer of a compound value (no stop-position leak)", () => {
    // A radial glow over a linear base. The greedy `.*)$` used to swallow both
    // functions, so splitting on top-level commas produced a broken stop like
    // "rgb(...) 72%)" that crashed CanvasGradient.addColorStop. The first layer
    // must parse cleanly with its trailing 72% turned into an offset.
    const compound =
      "radial-gradient(58% 30% at 50% 20%, rgba(255, 250, 244, 0.95), rgba(255, 250, 244, 0) 72%)," +
      " linear-gradient(rgb(242, 225, 211) 0%, rgb(245, 231, 219) 100%)";
    expect(parseCssGradient(compound)).toEqual({
      type: "radial",
      cx: 0.5,
      cy: 0.2,
      stops: [
        { offset: 0, color: "rgba(255, 250, 244, 0.95)" },
        { offset: 0.72, color: "rgba(255, 250, 244, 0)" },
      ],
    });
  });
});

describe("parseCssGradientLayers", () => {
  it("splits a compound value into its foreground-first layers", () => {
    const compound =
      "radial-gradient(58% 30% at 50% 20%, rgba(255, 250, 244, 0.95), rgba(255, 250, 244, 0) 72%)," +
      " linear-gradient(rgb(242, 225, 211) 0%, rgb(245, 231, 219) 100%)";
    const layers = parseCssGradientLayers(compound);
    expect(layers.map((layer) => layer.type)).toEqual(["radial", "linear"]);
    expect(layers[1]).toEqual({
      type: "linear",
      angle: 180,
      stops: [
        { offset: 0, color: "rgb(242, 225, 211)" },
        { offset: 1, color: "rgb(245, 231, 219)" },
      ],
    });
  });

  it("returns a single-element array for a lone gradient", () => {
    expect(parseCssGradientLayers("linear-gradient(#fff, #000)")).toHaveLength(1);
  });

  it("returns an empty array for non-gradient values", () => {
    expect(parseCssGradientLayers("none")).toEqual([]);
    expect(parseCssGradientLayers(undefined)).toEqual([]);
  });
});

describe("radialGradientKonvaProps", () => {
  it("centres on the focal point and reaches the farthest corner", () => {
    const gradient = parseCssGradient(
      "radial-gradient(circle at 70% 30%, rgb(255, 189, 223) 0%, rgb(255, 78, 154) 55%, rgb(58, 26, 58) 100%)",
    );
    if (!gradient || gradient.type !== "radial") throw new Error("not radial");

    const props = radialGradientKonvaProps(gradient, 100, 100);
    // Focal point is (0.7*100, 0.3*100) = (70, 30).
    expect(props.fillRadialGradientStartPoint).toEqual({ x: 70, y: 30 });
    expect(props.fillRadialGradientEndPoint).toEqual({ x: 70, y: 30 });
    expect(props.fillRadialGradientStartRadius).toBe(0);
    // Farthest corner from (70,30) is (0,100): hypot(70,70) ≈ 99.0.
    expect(props.fillRadialGradientEndRadius).toBeCloseTo(Math.hypot(70, 70), 5);
    expect(props.fillRadialGradientColorStops).toEqual([
      0,
      "rgb(255, 189, 223)",
      0.55,
      "rgb(255, 78, 154)",
      1,
      "rgb(58, 26, 58)",
    ]);
  });
});

describe("parseCssShadow", () => {
  it("parses a color-first box-shadow and drops spread", () => {
    expect(parseCssShadow("rgb(214, 240, 255) 4px 4px 0px 0px")).toEqual({
      color: "rgb(214, 240, 255)",
      offsetX: 4,
      offsetY: 4,
      blur: 0,
    });
  });

  it("parses a trailing-color box-shadow with blur", () => {
    expect(parseCssShadow("6px 8px 12px rgba(0, 0, 0, 0.25)")).toEqual({
      color: "rgba(0, 0, 0, 0.25)",
      offsetX: 6,
      offsetY: 8,
      blur: 12,
    });
  });

  it("returns null for 'none' and empty input", () => {
    expect(parseCssShadow("none")).toBeNull();
    expect(parseCssShadow("")).toBeNull();
    expect(parseCssShadow(undefined)).toBeNull();
  });

  // 예전에는 inset 을 «겉그림자로» 그렸다. 안쪽 빛을 바깥에 칠하는 셈이라 원본과
  // 다른 자리에 그림자가 생긴다 — Konva 에 안쪽 그림자가 없으니 안 그리는 쪽이 맞다.
  // 실측: 상세페이지 템플릿의 box-shadow 188번 중 inset «만» 쓰는 것은 10번.
  it("inset 만 있으면 그리지 않는다", () => {
    expect(parseCssShadow("inset 0px 2px 4px #112233")).toBeNull();
  });

  it("hex 색을 읽는다", () => {
    expect(parseCssShadow("0px 2px 4px #112233")).toEqual({
      color: "#112233",
      offsetX: 0,
      offsetY: 2,
      blur: 4,
    });
  });

  it("does not stall on malformed values", () => {
    // Backtracking used to grow with the square of the length here.
    const started = Date.now();
    expect(parseCssShadow("rgb(".repeat(20_000))).toBeNull();
    expect(parseCssShadow(`4px 4px ${"9".repeat(60_000)}`)).toEqual({
      color: "#000000",
      offsetX: 4,
      offsetY: 4,
      blur: 0,
    });
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
