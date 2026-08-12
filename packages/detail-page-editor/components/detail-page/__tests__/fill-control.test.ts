import { describe, expect, it } from "vitest";

import {
  isGradientValue,
  parseGradient,
  buildGradient,
  parseStops,
  buildStops,
} from "../fill-control";

describe("isGradientValue", () => {
  it("linear-gradient 문자열이면 true", () => {
    expect(isGradientValue("linear-gradient(90deg, #f00 0%, #00f 100%)")).toBe(true);
  });
  it("hex/rgb 단색이면 false", () => {
    expect(isGradientValue("#ff0000")).toBe(false);
    expect(isGradientValue("rgb(1,2,3)")).toBe(false);
    expect(isGradientValue("")).toBe(false);
  });
});

describe("parseGradient", () => {
  it("각도와 시작/끝 색을 뽑는다", () => {
    expect(parseGradient("linear-gradient(90deg, #ff0000 0%, #0000ff 100%)")).toEqual({
      angle: 90,
      from: "#ff0000",
      to: "#0000ff",
    });
  });
  it("각도가 없으면 180(CSS 기본)", () => {
    const g = parseGradient("linear-gradient(#111 0%, #222 100%)");
    expect(g?.angle).toBe(180);
  });
  it("rgb() 콤마에 걸리지 않고 색 토큰만 뽑는다", () => {
    expect(parseGradient("linear-gradient(45deg, rgb(255, 0, 0) 0%, #00ff00 100%)")).toEqual({
      angle: 45,
      from: "rgb(255, 0, 0)",
      to: "#00ff00",
    });
  });
  it("3개 이상 stop이면 첫/끝을 쓴다", () => {
    const g = parseGradient("linear-gradient(0deg, #aaa 0%, #bbb 50%, #ccc 100%)");
    expect(g).toEqual({ angle: 0, from: "#aaa", to: "#ccc" });
  });
  it("gradient가 아니면 null", () => {
    expect(parseGradient("#ff0000")).toBeNull();
  });
});

describe("buildGradient", () => {
  it("스톡 편집기가 이해하는 문자열을 만든다", () => {
    expect(buildGradient({ angle: 120, from: "#f00", to: "#00f" })).toBe(
      "linear-gradient(120deg, #f00 0%, #00f 100%)",
    );
  });
  it("build→parse 왕복이 보존된다", () => {
    const s = buildGradient({ angle: 30, from: "#123456", to: "#abcdef" });
    expect(parseGradient(s)).toEqual({ angle: 30, from: "#123456", to: "#abcdef" });
  });
});

describe("parseStops", () => {
  it("여러 stop을 색·위치로 뽑는다", () => {
    expect(parseStops("linear-gradient(90deg, #f00 0%, #0f0 40%, #00f 100%)")).toEqual({
      angle: 90,
      stops: [
        { color: "#f00", pos: 0 },
        { color: "#0f0", pos: 40 },
        { color: "#00f", pos: 100 },
      ],
    });
  });
  it("위치가 없으면 균등 분배한다", () => {
    const g = parseStops("linear-gradient(0deg, #a00, #0a0, #00a)");
    expect(g?.stops.map((s) => Math.round(s.pos))).toEqual([0, 50, 100]);
  });
  it("rgb() 콤마 안에서 잘리지 않는다", () => {
    const g = parseStops("linear-gradient(45deg, rgb(255, 0, 0) 0%, #00ff00 100%)");
    expect(g?.stops[0].color).toBe("rgb(255, 0, 0)");
    expect(g?.stops[1].color).toBe("#00ff00");
  });
  it("각도가 없으면 180", () => {
    expect(parseStops("linear-gradient(#111 0%, #222 100%)")?.angle).toBe(180);
  });
  it("gradient가 아니면 null", () => {
    expect(parseStops("#ff0000")).toBeNull();
  });
});

describe("buildStops", () => {
  it("N-stop 문자열을 만든다", () => {
    expect(
      buildStops({
        angle: 135,
        stops: [
          { color: "#f00", pos: 0 },
          { color: "#0f0", pos: 50 },
          { color: "#00f", pos: 100 },
        ],
      }),
    ).toBe("linear-gradient(135deg, #f00 0%, #0f0 50%, #00f 100%)");
  });
  it("build→parse 왕복이 보존된다", () => {
    const s = buildStops({
      angle: 210,
      stops: [
        { color: "#111111", pos: 0 },
        { color: "#888888", pos: 30 },
        { color: "#eeeeee", pos: 100 },
      ],
    });
    expect(parseStops(s)).toEqual({
      angle: 210,
      stops: [
        { color: "#111111", pos: 0 },
        { color: "#888888", pos: 30 },
        { color: "#eeeeee", pos: 100 },
      ],
    });
  });
  it("위치를 0~100으로 클램프한다", () => {
    const s = buildStops({
      angle: 0,
      stops: [
        { color: "#000", pos: -20 },
        { color: "#fff", pos: 140 },
      ],
    });
    expect(s).toBe("linear-gradient(0deg, #000 0%, #fff 100%)");
  });
});
