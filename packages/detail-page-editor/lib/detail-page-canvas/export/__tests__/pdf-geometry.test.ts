import { describe, expect, it } from "vitest";

import {
  ellipsePath,
  parsePoints,
  polygonPath,
  rectPath,
  svgPathToPdf,
} from "../pdf/geometry";

/** Endpoint of the last curve/line operator, for arc round-trip checks. */
function endPoint(ops: string[]): [number, number] {
  const last = [...ops].reverse().find((op) => /[ml]$|c$/.test(op)) ?? "";
  const numbers = (last.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  return [numbers[numbers.length - 2], numbers[numbers.length - 1]];
}

/** Every y coordinate in a path; each operator carries whole (x, y) pairs. */
function ys(ops: string[]): number[] {
  return ops
    .flatMap((op) => (op.match(/-?\d*\.?\d+/g) ?? []).map(Number))
    .filter((_, i) => i % 2 === 1);
}

describe("svgPathToPdf", () => {
  it("lowers lines and closepath", () => {
    expect(svgPathToPdf("M0 0 L10 0 Z")).toEqual(["0 0 m", "10 0 l", "h"]);
  });

  it("treats extra pairs after M as implicit lineTos", () => {
    expect(svgPathToPdf("M0 0 10 5")).toEqual(["0 0 m", "10 5 l"]);
  });

  it("resolves relative commands against the cursor", () => {
    expect(svgPathToPdf("M10 10 l5 0 h5 v5")).toEqual([
      "10 10 m",
      "15 10 l",
      "20 10 l",
      "20 15 l",
    ]);
  });

  it("raises quadratics to cubics (PDF has no quadratic operator)", () => {
    const ops = svgPathToPdf("M0 0 Q10 0 10 10");
    expect(ops).toHaveLength(2);
    expect(ops[1]).toMatch(/c$/);
    expect(endPoint(ops)).toEqual([10, 10]);
  });

  it("mirrors the previous control point for smooth curves", () => {
    const ops = svgPathToPdf("M0 0 C0 5 5 10 10 10 S20 5 20 0");
    // Reflection of (5,10) about (10,10) is (15,10).
    expect(ops[2]).toMatch(/^15 10 /);
    expect(endPoint(ops)).toEqual([20, 0]);
  });

  it("converts arcs to curves that land on the arc's endpoint", () => {
    const ops = svgPathToPdf("M0 0 A5 5 0 0 1 10 0");
    expect(ops.length).toBeGreaterThan(1);
    expect(ops.slice(1).every((op) => op.endsWith("c"))).toBe(true);
    const [x, y] = endPoint(ops);
    expect(x).toBeCloseTo(10, 3);
    expect(y).toBeCloseTo(0, 3);
  });

  it("bends an arc to the side its sweep flag asks for", () => {
    // A flipped sweep is the classic arc bug — it mirrors every rounded corner.
    // sweep=1 walks the ellipse in the positive-angle direction (up, in y-down
    // space); sweep=0 walks it the other way.
    expect(Math.min(...ys(svgPathToPdf("M0 0 A5 5 0 0 1 10 0")))).toBeLessThan(0);
    expect(Math.max(...ys(svgPathToPdf("M0 0 A5 5 0 0 0 10 0")))).toBeGreaterThan(0);
  });

  it("takes the long way round when the large-arc flag is set", () => {
    const extent = (d: string) => Math.max(...ys(svgPathToPdf(d)).map(Math.abs));
    expect(extent("M0 0 A5 5 0 1 1 5 0")).toBeGreaterThan(extent("M0 0 A5 5 0 0 1 5 0"));
  });

  it("survives malformed data instead of spinning", () => {
    expect(svgPathToPdf("")).toEqual([]);
    expect(svgPathToPdf("garbage")).toEqual([]);
  });
});

describe("shape paths", () => {
  it("emits a plain rect operator when there is no corner radius", () => {
    expect(rectPath(1, 2, 30, 40)).toEqual(["1 2 30 40 re"]);
  });

  it("rounds corners with curves and closes the path", () => {
    const ops = rectPath(0, 0, 100, 50, 10);
    expect(ops.filter((op) => op.endsWith("c"))).toHaveLength(4);
    expect(ops.at(-1)).toBe("h");
  });

  it("clamps a corner radius to half the shorter side", () => {
    expect(rectPath(0, 0, 20, 20, 999)).toEqual(rectPath(0, 0, 20, 20, 10));
  });

  it("draws an ellipse as four curves", () => {
    const ops = ellipsePath(50, 50, 20, 10);
    expect(ops[0]).toBe("70 50 m");
    expect(ops.filter((op) => op.endsWith("c"))).toHaveLength(4);
  });

  it("builds polygons and open polylines", () => {
    expect(polygonPath([0, 0, 10, 0, 10, 10], true)).toEqual([
      "0 0 m",
      "10 0 l",
      "10 10 l",
      "h",
    ]);
    expect(polygonPath([0, 0, 10, 0], false)).toEqual(["0 0 m", "10 0 l"]);
  });

  it("parses SVG point lists in both separator styles", () => {
    expect(parsePoints("1,2 3,4")).toEqual([1, 2, 3, 4]);
    expect(parsePoints("1 2 3 4")).toEqual([1, 2, 3, 4]);
  });
});
