import { describe, expect, it } from "vitest";

import {
  formatChartValue,
  inferDecimals,
  parseChartNumber,
} from "../format";

describe("parseChartNumber", () => {
  it("천단위 콤마와 단위 접미사를 흡수한다", () => {
    expect(parseChartNumber("1,234")).toBe(1234);
    expect(parseChartNumber("0.9ms")).toBe(0.9);
    expect(parseChartNumber(" 45% ")).toBe(45);
    expect(parseChartNumber("₩12,000")).toBe(12000);
  });

  it("음수와 숫자 타입을 그대로 읽는다", () => {
    expect(parseChartNumber("-3.5")).toBe(-3.5);
    expect(parseChartNumber(12)).toBe(12);
  });

  it("읽을 수 없으면 0이 아니라 null이다", () => {
    // 0으로 떨어지면 "값 없음"이 "0"으로 둔갑해 막대가 거짓말을 한다.
    expect(parseChartNumber("")).toBeNull();
    expect(parseChartNumber("해당 없음")).toBeNull();
    expect(parseChartNumber(null)).toBeNull();
    expect(parseChartNumber(Number.NaN)).toBeNull();
  });
});

describe("formatChartValue", () => {
  it("소수 자릿수와 단위를 붙인다", () => {
    expect(formatChartValue(0.9, { decimals: 1, unit: "ms" })).toBe("0.9ms");
    expect(formatChartValue(92, { unit: "%" })).toBe("92%");
  });

  it("천단위를 끊는다", () => {
    expect(formatChartValue(1234567)).toBe("1,234,567");
    expect(formatChartValue(-1234.5, { decimals: 1 })).toBe("-1,234.5");
    expect(formatChartValue(1234, { grouping: false })).toBe("1234");
  });

  it("값이 없으면 빈 문자열이다", () => {
    expect(formatChartValue(null, { unit: "%" })).toBe("");
  });
});

describe("inferDecimals", () => {
  it("가장 긴 소수부를 따르되 2자리에서 자른다", () => {
    expect(inferDecimals([1, 2, 3])).toBe(0);
    expect(inferDecimals([1.5, 2, null])).toBe(1);
    expect(inferDecimals([1.23456])).toBe(2);
  });
});
