/**
 * 도형 → SVG. 화면에 그리는 규칙(`render/element-view.tsx`의 `FigureBody`)과 같은
 * 그림이 나와야 한다 — 여기가 어긋나면 GIF·내보내기만 다르게 나온다.
 */

import { describe, expect, it } from "vitest";

import { figureToSvg } from "@/lib/leviosa-canvas/paint/figure-svg";

describe("figureToSvg", () => {
  it("네모는 요소 치수 그대로", () => {
    const svg = figureToSvg({ subType: "rect", width: 400, height: 24, fill: "#26221e" })!;
    expect(svg).toContain('width="400" height="24"');
    expect(svg).toContain('<rect x="0" y="0" width="400" height="24" fill="#26221e"');
    expect(svg).toContain("xmlns=");
  });

  it("동그라미는 중심 기준 타원으로(캔버스와 같은 규약)", () => {
    const svg = figureToSvg({ subType: "circle", width: 100, height: 50 })!;
    expect(svg).toContain('<ellipse cx="50" cy="25" rx="50" ry="25"');
  });

  it("채우기가 없으면 none — 빈 문자열은 SVG에서 검정이 된다", () => {
    expect(figureToSvg({ subType: "rect", width: 10, height: 10 })).toContain(
      'fill="none"',
    );
  });

  it("테두리 절반이 상자 밖으로 나가므로 viewBox를 넓힌다", () => {
    const svg = figureToSvg({
      subType: "rect",
      width: 100,
      height: 100,
      stroke: "#000",
      strokeWidth: 8,
    })!;
    expect(svg).toContain('viewBox="-4 -4 108 108"');
    expect(svg).toContain('stroke-width="8"');
  });

  it("점선은 dash 배열 그대로", () => {
    const svg = figureToSvg({
      subType: "rect",
      width: 10,
      height: 10,
      stroke: "#000",
      strokeWidth: 1,
      dash: [6, 5],
    })!;
    expect(svg).toContain('stroke-dasharray="6 5"');
  });

  it("둥글기는 custom 아래에 있어도 읽는다(디컴포저가 거기 넣는다)", () => {
    const svg = figureToSvg({
      subType: "rect",
      width: 10,
      height: 10,
      custom: { cornerRadius: 4 },
    })!;
    expect(svg).toContain('rx="4"');
  });

  it("그라데이션 문자열은 손대지 않는다(부르는 쪽이 defs로 바꿔 끼운다)", () => {
    const fill = "linear-gradient(90deg, #f00 0%, #00f 100%)";
    expect(figureToSvg({ subType: "rect", width: 10, height: 10, fill })).toContain(
      `fill="${fill}"`,
    );
  });

  it("크기가 없으면 null", () => {
    expect(figureToSvg({ subType: "rect", width: 0, height: 10 })).toBeNull();
  });
});
