/**
 * 선택 요소끼리 **간격**을 고르게. Figma·Canva의 distribute.
 *
 * 정렬(``alignInFrame``)은 기준 상자 안에서 한 줄로 세우는 것이고, 이건 이미 흩어져
 * 있는 것들의 사이를 고르게 벌리는 것이다. 아이콘 3~5개를 나란히 놓는 배치에서
 * 지금까지는 매번 눈대중이었다.
 *
 * **중심 간격이 아니라 여백을 고르게 한다.** 크기가 다른 요소들에서 중심을 등간격으로
 * 두면 큰 것 옆이 좁아 보인다 — 눈이 재는 건 사이 여백이다.
 */

export type DistributeAxis = "x" | "y";

export type DistributeItem = {
  id: string;
  /** 축 방향 시작 좌표(x 또는 y). */
  start: number;
  /** 축 방향 크기(width 또는 height). */
  size: number;
};

/**
 * 각 요소가 가야 할 시작 좌표. 양 끝은 **그대로 둔다** — 사용자가 잡아 둔 전체 폭이
 * 안 변해야 결과가 예측된다.
 *
 * 셋 미만이거나 전체 폭이 없으면 null(버튼을 비활성).
 */
export function distributeCoords(
  items: ReadonlyArray<DistributeItem>,
): Map<string, number> | null {
  if (items.length < 3) return null;
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last.start + last.size - first.start;
  if (!Number.isFinite(span) || span <= 0) return null;

  const content = sorted.reduce((sum, it) => sum + it.size, 0);
  // 겹쳐 있으면 음수가 나온다 — 그대로 쓴다. 고르게 겹치는 게 제멋대로 겹치는 것보다
  // 낫고, 사용자가 폭을 넓히면 바로 풀린다.
  const gap = (span - content) / (sorted.length - 1);

  const out = new Map<string, number>();
  let cursor = first.start;
  for (const it of sorted) {
    out.set(it.id, Math.round(cursor));
    cursor += it.size + gap;
  }
  // 반올림이 쌓여 마지막이 밀리지 않게 끝은 못 박는다.
  out.set(last.id, Math.round(last.start));
  return out;
}

export type DistributeElement = {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  parent?: unknown;
};

/**
 * 배분할 수 있는 선택인가.
 *
 * 셋 이상이면서 **부모가 같아야** 한다. 그룹 자식과 최상위 요소가 섞이면 좌표계가
 * 달라(그룹 자식의 x/y는 그룹 로컬 공간) 뒤섞인 결과가 나온다.
 */
export function canDistribute(els: ReadonlyArray<DistributeElement>): boolean {
  if (els.length < 3) return false;
  const parent = els[0].parent;
  return els.every((el) => el.parent === parent);
}

/** 축 좌표를 뽑아 배분 항목으로. 숫자가 아닌 값이 하나라도 있으면 null. */
export function toItems(
  els: ReadonlyArray<DistributeElement>,
  axis: DistributeAxis,
): DistributeItem[] | null {
  const out: DistributeItem[] = [];
  for (const el of els) {
    const start = axis === "x" ? el.x : el.y;
    const size = axis === "x" ? el.width : el.height;
    if (typeof start !== "number" || typeof size !== "number") return null;
    if (!Number.isFinite(start) || !Number.isFinite(size)) return null;
    out.push({ id: el.id, start, size });
  }
  return out;
}
