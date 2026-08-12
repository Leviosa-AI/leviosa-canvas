import { describe, expect, it } from "vitest";

import { createChartSpec } from "../defaults";
import {
  itemColor,
  ratioOf,
  resolveChart,
} from "../normalize";
import type { ChartData, ChartSpec } from "../types";

const DATA: ChartData = {
  labels: ["가", "나", "다"],
  series: [
    { name: "값", values: [30, 90, 60] },
    { name: "보조", values: [10, 20, 30] },
  ],
};

function spec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return { ...createChartSpec({ width: 600, data: DATA }), ...overrides };
}

describe("resolveChart", () => {
  it("종류가 못 그리는 시리즈는 렌더에서만 빼고 데이터에는 남긴다", () => {
    const s = spec({ kind: "bar-h" });
    const resolved = resolveChart(s);
    expect(resolved.series).toHaveLength(1);
    expect(resolved.hiddenSeries).toBe(1);
    // 원본은 그대로 — 다시 line으로 바꾸면 두 시리즈가 되살아나야 한다.
    expect(s.data.series).toHaveLength(2);
  });

  it("정렬은 첫 시리즈 기준으로 라벨과 값을 함께 옮긴다", () => {
    const resolved = resolveChart(
      spec({ options: { ...spec().options, sort: "desc" } }),
    );
    expect(resolved.labels).toEqual(["나", "다", "가"]);
    expect(resolved.series[0].values).toEqual([90, 60, 30]);
  });

  it("정렬하면 강조 인덱스도 옮겨 앉는다", () => {
    // 원본 0번("가")을 강조 → 내림차순에서는 마지막 자리로 간다.
    const resolved = resolveChart(
      spec({ options: { ...spec().options, sort: "desc", highlightIndex: 0 } }),
    );
    expect(resolved.highlightIndex).toBe(2);
  });

  it("빈 값은 정렬에서 항상 뒤로 간다", () => {
    const resolved = resolveChart(
      spec({
        data: {
          labels: ["가", "나", "다"],
          series: [{ name: "값", values: [10, null, 50] }],
        },
        options: { ...spec().options, sort: "desc" },
      }),
    );
    expect(resolved.labels).toEqual(["다", "가", "나"]);
  });

  it("최댓값은 auto면 데이터에서, 지정하면 그 값이다", () => {
    expect(resolveChart(spec()).max).toBe(90);
    expect(resolveChart(spec({ options: { ...spec().options, max: 100 } })).max).toBe(
      100,
    );
  });

  it("값이 전부 비어도 축이 0으로 무너지지 않는다", () => {
    const resolved = resolveChart(
      spec({
        data: { labels: ["가"], series: [{ name: "값", values: [null] }] },
      }),
    );
    expect(resolved.max).toBe(1);
  });

  it("누적은 항목별 합으로 축을 잡는다", () => {
    const resolved = resolveChart(spec({ kind: "stack" }));
    // 나: 90 + 20 = 110
    expect(resolved.max).toBe(110);
    expect(resolved.series).toHaveLength(2);
  });
});

describe("itemColor", () => {
  it("강조가 있으면 그 항목만 팔레트 색, 나머지는 muted", () => {
    const s = spec();
    expect(itemColor(s, 1, 1)).toBe(s.style.palette[0]);
    expect(itemColor(s, 0, 1)).toBe(s.style.mutedColor);
  });

  it("강조가 없으면 팔레트를 순환한다", () => {
    const s = spec();
    expect(itemColor(s, 1, null)).toBe(s.style.palette[1]);
    expect(itemColor(s, s.style.palette.length, null)).toBe(s.style.palette[0]);
  });
});

describe("ratioOf", () => {
  it("0~1로 자르고 값이 없으면 0이다", () => {
    expect(ratioOf(50, 100)).toBe(0.5);
    expect(ratioOf(150, 100)).toBe(1);
    expect(ratioOf(null, 100)).toBe(0);
    expect(ratioOf(10, 0)).toBe(0);
  });
});
