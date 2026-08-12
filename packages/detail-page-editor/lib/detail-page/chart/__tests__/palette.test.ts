import { describe, expect, it } from "vitest";

import { createChartSpec } from "../defaults";
import { itemColor } from "../normalize";
import {
  MAX_PALETTE_SLOTS,
  paletteColorAt,
  paletteScope,
  paletteSlots,
  withPaletteColor,
} from "../palette";
import type { ChartSpec } from "../types";

const DATA = {
  labels: ["1주", "2주", "4주"],
  series: [
    { name: "우리 제품", values: [10, 20, 30] },
    { name: "타사", values: [5, 8, 12] },
  ],
};

/**
 * 기본 프리셋은 ``highlightIndex: 0``이라 그대로 두면 늘 "강조" 범위다. 항목·시리즈
 * 범위를 보려면 강조를 꺼야 한다 — 그래서 헬퍼가 기본으로 꺼 둔다.
 */
function spec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  const base = createChartSpec({
    width: 600,
    data: DATA,
    options: { highlightIndex: null },
  });
  return { ...base, ...overrides };
}

describe("paletteScope", () => {
  it("막대·도넛은 항목별", () => {
    expect(paletteScope(spec({ kind: "bar-v" }))).toBe("item");
    expect(paletteScope(spec({ kind: "donut" }))).toBe("item");
  });

  it("라인·스택은 시리즈별", () => {
    // renderers/line.ts·stack.ts가 palette[시리즈 인덱스]를 쓴다.
    expect(paletteScope(spec({ kind: "line" }))).toBe("series");
    expect(paletteScope(spec({ kind: "stack" }))).toBe("series");
  });

  it("강조 항목이 있으면 첫 색 하나뿐", () => {
    const highlighted = spec({
      kind: "bar-v",
      options: { ...spec().options, highlightIndex: 1 },
    });
    expect(paletteScope(highlighted)).toBe("highlight");
  });

  it("기본 프리셋은 강조 범위다", () => {
    // createChartSpec의 기본 highlightIndex가 0이다 — 새로 넣은 차트는 색 슬롯이 하나.
    expect(paletteScope(createChartSpec({ width: 600, data: DATA }))).toBe("highlight");
  });
});

describe("paletteSlots", () => {
  it("항목형은 항목 이름을 단다", () => {
    const slots = paletteSlots(spec({ kind: "bar-v" }));
    expect(slots.map((s) => s.name)).toEqual(["1주", "2주", "4주"]);
  });

  it("시리즈형은 시리즈 이름을 단다", () => {
    const slots = paletteSlots(spec({ kind: "line" }));
    expect(slots.map((s) => s.name)).toEqual(["우리 제품", "타사"]);
  });

  it("강조 항목이 있으면 슬롯 하나", () => {
    // 여러 개 펼치면 눌러도 아무 일 없는 컨트롤이 생긴다(나머지는 mutedColor라서).
    const highlighted = spec({
      kind: "bar-v",
      options: { ...spec().options, highlightIndex: 2 },
    });
    const slots = paletteSlots(highlighted);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ index: 0, name: "4주" });
  });

  it("상한을 넘으면 잘라 낸다", () => {
    const many = spec({
      kind: "bar-v",
      data: {
        labels: Array.from({ length: 20 }, (_, i) => `${i}`),
        series: [{ name: "s", values: Array.from({ length: 20 }, () => 1) }],
      },
    });
    expect(paletteSlots(many)).toHaveLength(MAX_PALETTE_SLOTS);
  });

  it("보여 주는 색이 렌더러가 쓰는 색과 같다", () => {
    // 슬롯이 실제 결과와 다른 색을 보여 주면 고르개가 거짓말을 한다.
    const chart = spec({ kind: "bar-v" });
    for (const slot of paletteSlots(chart)) {
      expect(slot.color).toBe(itemColor(chart, slot.index, null));
    }
  });
});

describe("withPaletteColor", () => {
  it("그 자리 색만 바꾼다", () => {
    const next = withPaletteColor(spec(), 1, "#FF0000");
    expect(next.style.palette[1]).toBe("#FF0000");
    expect(next.style.palette[0]).toBe(spec().style.palette[0]);
  });

  it("팔레트를 늘릴 때 앞쪽 색이 안 흔들린다", () => {
    // 되돌아 쓰기(palette[i % length]) 때문에, 그냥 늘리면 손대지도 않은 항목이 바뀐다.
    const short = spec({ style: { ...spec().style, palette: ["#111111", "#222222"] } });
    const before = [0, 1, 2, 3].map((i) => paletteColorAt(short, i));
    const next = withPaletteColor(short, 3, "#FF0000");
    expect([0, 1, 2].map((i) => paletteColorAt(next, i))).toEqual(before.slice(0, 3));
    expect(next.style.palette[3]).toBe("#FF0000");
  });

  it("빈 팔레트도 다루다 안 터진다", () => {
    const empty = spec({ style: { ...spec().style, palette: [] } });
    expect(paletteColorAt(empty, 0)).toBeTruthy();
    expect(withPaletteColor(empty, 0, "#FF0000").style.palette).toEqual(["#FF0000"]);
  });
});
