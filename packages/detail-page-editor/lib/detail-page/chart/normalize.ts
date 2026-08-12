/**
 * 스펙 → **렌더에 바로 쓸 수 있는 형태**로 고르는 단계.
 *
 * 여기서 지키는 규칙 하나: **데이터를 절대 잘라내지 않는다.** 종류마다 그릴 수 있는
 * 시리즈 수가 다르지만(도넛은 하나뿐), 못 그리는 시리즈는 렌더에서 빼기만 하고
 * ``spec.data``에는 그대로 남긴다. 그래야 막대 → 도넛 → 막대로 돌아왔을 때 잃었던
 * 시리즈가 되살아난다. Canva가 "차트 종류를 바꿔도 데이터가 유지된다"고 말하는
 * 부분이 정확히 이것이다.
 */

import type { ChartKind, ChartSeries, ChartSpec } from "./types";

/** 종류별로 **그릴 수 있는** 시리즈 수. ``null``이면 제한 없음. */
export const SERIES_LIMIT: Record<ChartKind, number | null> = {
  "bar-h": 1,
  "bar-v": 1,
  donut: 1,
  gauge: 1,
  line: null,
  stack: null,
};

export type ResolvedChart = {
  /** 정렬이 적용된 뒤의 라벨. */
  labels: string[];
  /** 렌더에 실제로 쓰이는 시리즈(정렬 적용). */
  series: ChartSeries[];
  /** 축 최댓값(항상 > 0). */
  max: number;
  /**
   * **정렬 후 위치로 옮긴** 강조 인덱스.
   *
   * ``options.highlightIndex``는 사용자가 표에서 고른 원본 행 번호다. 정렬을 켜면
   * 그 행이 다른 자리로 가므로, 옮겨진 자리를 다시 계산해 두지 않으면 엉뚱한 막대가
   * 강조된다.
   */
  highlightIndex: number | null;
  /** 스펙에 남아 있지만 이 종류에서는 안 그려지는 시리즈 수. 0이면 알릴 것 없음. */
  hiddenSeries: number;
};

/** 정렬 기준이 되는 시리즈(첫 번째)의 값. 없으면 전부 null. */
function sortKeyValues(series: ChartSeries[], length: number): (number | null)[] {
  const first = series[0]?.values ?? [];
  return Array.from({ length }, (_, i) => first[i] ?? null);
}

/**
 * 정렬된 인덱스 순서. ``null``은 항상 뒤로 보낸다 — 빈 칸이 큰 값 사이에 끼면
 * 막대가 끊긴 것처럼 보인다.
 */
function orderOf(
  values: (number | null)[],
  sort: ChartSpec["options"]["sort"],
): number[] {
  const order = values.map((_, i) => i);
  if (sort === "none") return order;
  const dir = sort === "desc" ? -1 : 1;
  return order.sort((a, b) => {
    const va = values[a];
    const vb = values[b];
    if (va === null && vb === null) return a - b;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va === vb) return a - b; // 동점이면 원래 순서 유지(안정 정렬)
    return (va - vb) * dir;
  });
}

/**
 * 축 최댓값.
 *
 * ``"auto"``면 모든 시리즈의 최댓값. 값이 전부 0/음수/없음이면 1로 떨어진다 — 0으로
 * 나눠 NaN 폭을 만드는 것보다 "전부 빈 막대"가 낫다. 누적(stack)은 항목별 합이 축을
 * 정하므로 합으로 잰다.
 */
function resolveMax(
  kind: ChartKind,
  series: ChartSeries[],
  labelCount: number,
  max: ChartSpec["options"]["max"],
): number {
  if (typeof max === "number" && Number.isFinite(max) && max > 0) return max;
  let found = 0;
  if (kind === "stack") {
    for (let i = 0; i < labelCount; i += 1) {
      let sum = 0;
      for (const s of series) sum += Math.max(0, s.values[i] ?? 0);
      found = Math.max(found, sum);
    }
  } else {
    for (const s of series) {
      for (const value of s.values) {
        if (value !== null && Number.isFinite(value)) found = Math.max(found, value);
      }
    }
  }
  return found > 0 ? found : 1;
}

/** 스펙을 렌더 가능한 형태로 고른다. */
export function resolveChart(spec: ChartSpec): ResolvedChart {
  const limit = SERIES_LIMIT[spec.kind];
  const all = spec.data.series;
  const visible = limit === null ? all : all.slice(0, limit);
  const labelCount = spec.data.labels.length;

  const order = orderOf(sortKeyValues(visible, labelCount), spec.options.sort);
  const labels = order.map((i) => spec.data.labels[i] ?? "");
  const series = visible.map((s) => ({
    name: s.name,
    values: order.map((i) => s.values[i] ?? null),
  }));

  const source = spec.options.highlightIndex;
  const moved =
    source === null || source === undefined ? -1 : order.indexOf(source);

  return {
    labels,
    series,
    max: resolveMax(spec.kind, series, labelCount, spec.options.max),
    highlightIndex: moved >= 0 ? moved : null,
    hiddenSeries: Math.max(0, all.length - visible.length),
  };
}

/**
 * 항목 색: 강조가 지정돼 있으면 그 항목만 팔레트 첫 색, 나머지는 muted.
 *
 * ``highlight``는 **정렬 후** 인덱스여야 한다(``resolveChart``가 옮겨 준 값).
 */
export function itemColor(
  spec: ChartSpec,
  index: number,
  highlight: number | null,
): string {
  const { palette, mutedColor } = spec.style;
  if (highlight !== null && highlight !== undefined) {
    return index === highlight ? (palette[0] ?? mutedColor) : mutedColor;
  }
  return palette[index % Math.max(1, palette.length)] ?? mutedColor;
}

/** 0~1 비율. 축이 0이거나 값이 없으면 0. */
export function ratioOf(value: number | null, max: number): number {
  if (value === null || !Number.isFinite(value) || max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}
