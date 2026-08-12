/**
 * 팔레트를 **차트 종류에 맞는 슬롯**으로 펼친다.
 *
 * ``style.palette``는 한 배열인데 종류마다 무엇에 대응하는지가 다르다:
 *
 * - 막대·도넛·게이지 — **항목별**(``itemColor``가 ``palette[항목 인덱스]``를 쓴다)
 * - 라인·스택 — **시리즈별**(``renderers/line.ts``·``stack.ts``가 ``palette[시리즈 인덱스]``)
 *
 * 그래서 인스펙터도 종류를 보고 슬롯을 펼쳐야 한다. 한 색만 노출하면 "두 번째 막대 색을
 * 못 바꾸는" 상태가 되고, 반대로 항상 여러 개를 펼치면 아래 ``highlightIndex`` 경우에
 * **눌러도 아무 일도 안 일어나는 컨트롤**이 생긴다.
 *
 * ``highlightIndex``가 지정되면 강조 항목만 ``palette[0]``을 쓰고 나머지는 전부
 * ``mutedColor``다(``normalize.ts``의 ``itemColor``). 이때 슬롯은 하나뿐이다.
 */

import { DEFAULT_CHART_PALETTE } from "./defaults";
import type { ChartSpec } from "./types";

/**
 * 패널에 펼칠 슬롯 상한.
 *
 * 항목이 20개인 차트에 색 고르개를 20개 세우면 인스펙터가 색 목록이 된다. 넘는 항목은
 * 팔레트를 되돌아 쓰므로(``palette[i % length]``) 색이 없어지지는 않는다.
 */
export const MAX_PALETTE_SLOTS = 12;

export type PaletteScope = "highlight" | "series" | "item";

export type PaletteSlot = {
  /** ``style.palette``에서의 자리. */
  index: number;
  /** 데이터가 준 이름(항목 라벨 또는 시리즈 이름). 비어 있을 수 있다. */
  name: string;
  color: string;
};

/** 이 차트에서 팔레트가 무엇에 대응하는가. */
export function paletteScope(spec: ChartSpec): PaletteScope {
  if (spec.options.highlightIndex !== null) return "highlight";
  return spec.kind === "line" || spec.kind === "stack" ? "series" : "item";
}

/** ``index``에 실제로 쓰이는 색. 팔레트가 짧으면 되돌아 쓴다(렌더러와 같은 규칙). */
export function paletteColorAt(spec: ChartSpec, index: number): string {
  const palette = spec.style.palette;
  if (palette.length === 0) return DEFAULT_CHART_PALETTE[0];
  return palette[index % palette.length];
}

export function paletteSlots(spec: ChartSpec): PaletteSlot[] {
  const scope = paletteScope(spec);
  if (scope === "highlight") {
    const at = spec.options.highlightIndex ?? 0;
    return [{ index: 0, name: spec.data.labels[at] ?? "", color: paletteColorAt(spec, 0) }];
  }

  const names =
    scope === "series"
      ? spec.data.series.map((s) => s.name)
      : spec.data.labels.map((label) => label);
  const count = Math.min(MAX_PALETTE_SLOTS, Math.max(1, names.length));
  return Array.from({ length: count }, (_, index) => ({
    index,
    name: names[index] ?? "",
    color: paletteColorAt(spec, index),
  }));
}

/**
 * 슬롯 하나의 색을 바꾼 스펙.
 *
 * 팔레트가 그 자리까지 없으면 **지금 쓰이던 색으로 채워서** 늘린다. 그냥 늘리면 되돌아
 * 쓰기(``palette[i % length]``) 때문에 손대지도 않은 앞쪽 항목들의 색이 같이 바뀐다.
 */
export function withPaletteColor(
  spec: ChartSpec,
  index: number,
  color: string,
): ChartSpec {
  const palette = [...spec.style.palette];
  while (palette.length <= index) palette.push(paletteColorAt(spec, palette.length));
  palette[index] = color;
  return { ...spec, style: { ...spec.style, palette } };
}
