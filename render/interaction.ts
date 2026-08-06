/**
 * 캔버스에서 무엇을 집었는가, 그리고 끌고 놓은 결과를 문서에 어떻게 되돌려 쓰는가.
 *
 * 순수 함수만 둔다 — React도 Konva 인스턴스도 필요 없어야 테스트할 수 있다.
 */

import type { CanvasElement, CanvasStore } from "../store";
import { num, type Attrs } from "../types";

/** Konva 노드에서 위로 훑어 모은 요소 id들(바깥 → 안). */
export type HitPath = string[];

/**
 * 지금 클릭이 고를 요소.
 *
 * 기본은 **가장 바깥 요소**다(그룹을 통째로 집는다 — 사람이 기대하는 동작). 다만 이미
 * 그 그룹 안쪽을 보고 있으면(`scopeId`) 그 안에서 한 겹만 더 들어간 자식을 고른다.
 *
 * Polotno에서는 그룹에 id가 안 박혀 있어서 히트 테스트를 잎에서부터 거꾸로 되짚어야
 * 했다. 우리는 모든 노드에 id를 박으므로 경로가 그냥 나온다.
 */
export function pickFromPath(
  path: HitPath,
  scopeId: string | null,
): string | null {
  if (!path.length) return null;
  if (!scopeId) return path[0];
  const at = path.indexOf(scopeId);
  if (at < 0) return path[0];
  return path[at + 1] ?? scopeId;
}

/** 시프트 클릭 — 이미 골라 둔 것에 더하거나 뺀다. */
export function toggleSelection(current: string[], id: string): string[] {
  return current.includes(id)
    ? current.filter((one) => one !== id)
    : [...current, id];
}

/** 더블클릭으로 들어갈 수 있는 그룹인가 — 그 요소 자신이나 조상 중 그룹. */
export function drillTarget(
  store: CanvasStore,
  id: string,
): { scopeId: string; childId: string } | null {
  const el = store.getElementById(id);
  if (!el) return null;
  if (el.isContainer && el.children.length) {
    return { scopeId: el.id, childId: el.children[el.children.length - 1].id };
  }
  const parent = el.parent;
  if (parent && parent instanceof Object && "isContainer" in parent) {
    return { scopeId: (parent as CanvasElement).id, childId: el.id };
  }
  return null;
}

export type TransformResult = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

/**
 * 트랜스포머가 남긴 scale을 **폭·높이로 흡수한다.**
 *
 * Konva는 크기 조절을 노드의 scale로 표현하지만 우리 문서에는 scale이 없다(폭·높이만
 * 있다). scale을 그대로 두면 자식이 두 배로 커지고, 다음 번 조절이 그 위에 또 곱해진다.
 *
 * 텍스트는 예외가 하나 있다 — 가로세로가 **같은 비율**로 커졌으면(모서리 손잡이) 글자
 * 크기도 같이 키운다. 옆 손잡이(비율이 다름)는 상자만 넓히고 글자는 그대로 둔다.
 */
export function absorbTransform(
  el: Attrs,
  result: TransformResult,
): Attrs {
  const width = Math.max(1, result.width * result.scaleX);
  const height = Math.max(1, result.height * result.scaleY);
  const patch: Attrs = {
    x: result.x,
    y: result.y,
    width,
    height,
    rotation: result.rotation,
  };
  const uniform = Math.abs(result.scaleX - result.scaleY) < 0.001;
  if (el.type === "text" && uniform && Math.abs(result.scaleX - 1) > 0.001) {
    patch.fontSize = num(el, "fontSize", 14) * result.scaleX;
  }
  return patch;
}

/** 여러 요소를 한 번에 옮길 때, ⌘Z 한 번으로 돌아가게 묶는다. */
export function applyInTransaction(
  store: CanvasStore,
  run: () => void,
): void {
  store.history.startTransaction();
  try {
    run();
  } finally {
    store.history.endTransaction();
  }
}

/** 방향키 한 번의 이동량 — 시프트를 누르면 크게. */
export function nudgeStep(shift: boolean): number {
  return shift ? 10 : 1;
}

export function nudge(
  store: CanvasStore,
  els: ReadonlyArray<CanvasElement>,
  dx: number,
  dy: number,
): void {
  if (!els.length) return;
  applyInTransaction(store, () => {
    for (const el of els) {
      if (el.locked) continue;
      el.set({ x: (el.x ?? 0) + dx, y: (el.y ?? 0) + dy });
    }
  });
}
