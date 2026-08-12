/**
 * 차트 스펙 ↔ Canvas 스토어.
 *
 * 스토어를 만지는 방법은 차트와 표가 똑같아서 ``spec-group/sync``에 한 벌로 있다 —
 * 키 기반 diff, 한 번의 undo, 그룹 base 좌표 0, 자식을 잠그지 않기. **함정 설명은
 * 거기 있다.** 여기서는 "차트를 어떻게 그리고 어떻게 알아보는가"만 정한다.
 */

import {
  detachSpecGroup,
  groupBox,
  insertSpecGroup,
  readSpec,
  syncSpecGroup,
  writeSpec,
  type Box,
  type ElementLike,
  type SpecBinding,
  type StoreLike,
} from "../spec-group/sync";

import { absorbResize, renderChart } from "./render";
import { CHART_PART, type ChartSpec } from "./types";

export type { ElementLike, StoreLike };
export { documentFontFamily } from "../spec-group/sync";

/**
 * 저장된 문서에서 오는 값이라 형태를 믿지 않는다 — 최소한의 골격(버전·데이터 배열)만
 * 확인하고, 세부 필드는 렌더러의 기본값 처리에 맡긴다.
 */
function parseChartSpec(raw: unknown): ChartSpec | null {
  const spec = raw as Partial<ChartSpec>;
  if (spec.v !== 1) return null;
  if (!spec.kind || !spec.data || !Array.isArray(spec.data.labels)) return null;
  if (!Array.isArray(spec.data.series)) return null;
  return spec as ChartSpec;
}

const CHART_BINDING: SpecBinding<ChartSpec> = {
  customKey: "chart",
  partKey: CHART_PART,
  defaultName: "차트",
  render: renderChart,
  parse: parseChartSpec,
  absorbResize,
};

/** 그룹에서 차트 스펙을 꺼낸다. 차트가 아니면 ``null``. */
export function readChartSpec(el: ElementLike | null | undefined): ChartSpec | null {
  return readSpec(CHART_BINDING, el);
}

/** 스펙을 그룹에 되쓴다(다른 custom 키는 보존). */
export function writeChartSpec(el: ElementLike, spec: ChartSpec): void {
  writeSpec(CHART_BINDING, el, spec);
}

/** 그룹이 실제로 차지하는 상자. 그룹 모델이 아니라 자식에서 잰다. */
export function chartBox(group: ElementLike): Box | null {
  return groupBox(group);
}

export type InsertChartOptions = {
  /** 프레임 좌상단(페이지 좌표). 없으면 페이지 가운데. */
  origin?: { x: number; y: number };
  /** 레이어 트리에 뜰 이름. */
  name?: string;
};

/** 새 차트를 페이지에 놓고 그 그룹을 돌려준다. */
export function insertChart(
  store: StoreLike,
  spec: ChartSpec,
  options: InsertChartOptions = {},
): ElementLike | null {
  return insertSpecGroup(CHART_BINDING, store, spec, options);
}

/** 스펙이 바뀐 차트를 다시 그린다. 저장된 스펙(실제 frame이 채워진)을 돌려준다. */
export function syncChartGroup(
  store: StoreLike,
  group: ElementLike,
  next: ChartSpec,
): ChartSpec {
  return syncSpecGroup(CHART_BINDING, store, group, next);
}

/** 차트를 일반 그룹으로 푼다(되돌리기는 제공하지 않는다). */
export function detachChart(group: ElementLike): void {
  detachSpecGroup(CHART_BINDING, group);
}
