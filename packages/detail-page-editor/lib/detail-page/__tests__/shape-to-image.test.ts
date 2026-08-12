import { describe, expect, it } from "vitest";

import {
  gradientToSvgPaint,
  isShapeElement,
  patchFigureGradient,
  shapeSvgDataUri,
  withExplicitSize,
} from "../shape-to-image";

describe("isShapeElement", () => {
  it("svg·figure만 도형으로 본다", () => {
    expect(isShapeElement({ type: "svg" })).toBe(true);
    expect(isShapeElement({ type: "figure" })).toBe(true);
    expect(isShapeElement({ type: "image" })).toBe(false);
    expect(isShapeElement({ type: "text" })).toBe(false);
    expect(isShapeElement(null)).toBe(false);
  });
});

describe("gradientToSvgPaint", () => {
  it("단색이면 null(호출부가 색 문자열을 그대로 쓴다)", () => {
    expect(gradientToSvgPaint("#26221e", "g")).toBeNull();
    expect(gradientToSvgPaint("", "g")).toBeNull();
  });

  it("90도는 왼쪽에서 오른쪽으로 흐른다", () => {
    const paint = gradientToSvgPaint(
      "linear-gradient(90deg, #ff0000 0%, #0000ff 100%)",
      "g1",
    );
    expect(paint?.ref).toBe("url(#g1)");
    expect(paint?.def).toContain('x1="0.0000"');
    expect(paint?.def).toContain('x2="1.0000"');
    // 가로 방향이면 y는 움직이지 않는다.
    expect(paint?.def).toContain('y1="0.5000"');
    expect(paint?.def).toContain('y2="0.5000"');
  });

  it("180도는 위에서 아래로 흐른다(CSS 기본 방향)", () => {
    const paint = gradientToSvgPaint(
      "linear-gradient(180deg, #fff 0%, #000 100%)",
      "g2",
    );
    expect(paint?.def).toContain('y1="0.0000"');
    expect(paint?.def).toContain('y2="1.0000"');
  });

  it("중간 stop을 모두 옮긴다", () => {
    const paint = gradientToSvgPaint(
      "linear-gradient(90deg, #f00 0%, #0f0 40%, #00f 100%)",
      "g3",
    );
    expect(paint?.def.match(/<stop /g)).toHaveLength(3);
    expect(paint?.def).toContain('offset="40%"');
  });
});

describe("patchFigureGradient", () => {
  const markup =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="10">' +
    '<path d="M 0 0" fill="linear-gradient(90deg, #f00 0%, #00f 100%)"/></svg>';

  it("무효한 paint를 defs 참조로 바꾼다(안 하면 도형이 검게 굳는다)", () => {
    const out = patchFigureGradient(markup, {
      id: "bar",
      fill: "linear-gradient(90deg, #f00 0%, #00f 100%)",
    });

    expect(out).not.toContain('fill="linear-gradient');
    expect(out).toContain('fill="url(#dp-grad-bar)"');
    expect(out).toContain("<linearGradient");
  });

  it("단색 도형은 그대로 둔다", () => {
    const solid = '<svg width="10" height="10"><path fill="#26221e"/></svg>';
    expect(patchFigureGradient(solid, { fill: "#26221e" })).toBe(solid);
  });
});

describe("withExplicitSize", () => {
  it("viewBox만 있는 마크업에 픽셀 크기를 박는다", () => {
    const out = withExplicitSize(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path/></svg>',
      400,
      24,
    );

    expect(out).toContain('width="400"');
    expect(out).toContain('height="24"');
    expect(out).toContain('viewBox="0 0 24 24"');
  });

  it("기존 크기를 덮어쓴다(요소 크기가 정답이다)", () => {
    const out = withExplicitSize(
      '<svg width="24" height="24" viewBox="0 0 24 24"/>',
      400,
      24,
    );

    expect(out).toContain('width="400"');
    expect(out.match(/width="/g)).toHaveLength(1);
  });

  it("루트가 svg가 아니면 손대지 않는다", () => {
    expect(withExplicitSize("not svg", 10, 10)).toBe("not svg");
  });
});

describe("shapeSvgDataUri", () => {
  it("figure를 요소 치수 그대로 굽는다", async () => {
    const uri = await shapeSvgDataUri({
      id: "bar",
      type: "figure",
      subType: "rect",
      width: 400,
      height: 24,
      fill: "#26221e",
    });

    expect(uri?.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const markup = atob(uri!.split(",")[1]);
    expect(markup).toContain('width="400"');
    expect(markup).toContain('fill="#26221e"');
    expect(markup).toContain('<rect x="0" y="0" width="400" height="24"');
  });

  it("svg 도형은 색 치환까지 마친 마크업으로 굽는다", async () => {
    const source =
      '<svg viewBox="0 0 24 24"><path d="M0 0" fill="#FFF"/></svg>';
    const uri = await shapeSvgDataUri({
      type: "svg",
      width: 48,
      height: 48,
      src: `data:image/svg+xml;base64,${btoa(source)}`,
      colorsReplace: { "#ffffff": "#111111" },
    });

    const markup = atob(uri!.split(",")[1]);
    // 표기가 달라도(`#FFF` vs `#ffffff`) 같은 색이면 바뀐다.
    expect(markup).toContain('fill="#111111"');
    // xmlns 가 없던 마크업이라 채워 넣어야 `<img>`가 읽는다.
    expect(markup).toContain("xmlns=");
    expect(markup).toContain('width="48"');
  });

  it("그라데이션 figure도 유효한 paint로 굽는다", async () => {
    const uri = await shapeSvgDataUri({
      id: "bar",
      type: "figure",
      subType: "rect",
      width: 100,
      height: 10,
      fill: "linear-gradient(90deg, #ff0000 0%, #0000ff 100%)",
    });

    const markup = atob(uri!.split(",")[1]);
    expect(markup).toContain("<linearGradient");
    expect(markup).not.toContain('fill="linear-gradient');
  });

  it("크기가 없으면 굽지 않는다(0으로 그리면 빈 캔버스가 된다)", async () => {
    expect(
      await shapeSvgDataUri({ type: "figure", subType: "rect", width: 0 }),
    ).toBeNull();
  });

  it("도형이 아닌 요소는 null", async () => {
    expect(
      await shapeSvgDataUri({ type: "image", width: 10, height: 10 }),
    ).toBeNull();
  });
});
