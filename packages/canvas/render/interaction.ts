// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
/**
 * 캔버스에서 무엇을 집었는가, 그리고 끌고 놓은 결과를 문서에 어떻게 되돌려 쓰는가.
 *
 * 순수 함수만 둔다 — React도 Konva 인스턴스도 필요 없어야 테스트할 수 있다.
 */

import { flipArea } from "../edit/rect";
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
 * 스톡 편집기에서는 그룹에 id가 안 박혀 있어서 히트 테스트를 잎에서부터 거꾸로 되짚어야
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

/**
 * 손잡이를 반대편으로 넘겨 끌면(피그마·포토샵처럼) 뒤집힌다 — 음수 scale을 **`flipX`/`flipY`로
 * 바꿔 읽는다.** 돌려주는 `result`는 scale이 양수라 `absorbTransform`·`groupResizePatches`가
 * 그대로 먹는다.
 *
 * Konva는 뒤집힌 행렬을 분해할 때 음수를 scaleY에만 싣는다. 좌우 반전은 «180° 회전 +
 * 상하 반전»으로, 대각선 반전은 «180° 회전»으로 나온다. 눈에는 같은 그림이지만 회전값이
 * 튀므로, 180°를 더 돌린 쪽까지 두 표현 중 **원래 회전에 가까운 쪽**을 고른다.
 *
 * 문서의 뒤집기는 바깥 Group 안쪽에서 상자 가운데를 축으로 한다(element-view `flipped`).
 * Konva의 음수 scale은 원점을 축으로 하므로, 그 차이만큼 x/y를 옮겨 그림을 제자리에 둔다.
 */
export function resolveFlip(
  el: CanvasElement,
  result: TransformResult,
): { result: TransformResult; flip: Attrs | null } {
  const mirrored = result.scaleX < 0 || result.scaleY < 0;
  // 회전 손잡이로 90° 넘게 돌린 것도 «180° 더 돈» 것처럼 보인다. 회전은 크기를 안
  // 바꾸므로 scale이 그대로(1)면 회전으로 읽는다.
  const rotatedOnly =
    Math.abs(result.scaleX - 1) < 1e-3 && Math.abs(result.scaleY - 1) < 1e-3;
  if (!mirrored && (rotatedOnly || !turnedHalf(el, result.rotation))) {
    return { result, flip: null };
  }
  // 180° 더 돈 표현: R(r)·S(sx, sy) = R(r + 180)·S(−sx, −sy).
  let { rotation, scaleX: sx, scaleY: sy } = result;
  if (turnedHalf(el, rotation)) {
    rotation = normalizeDeg(rotation + 180);
    sx = -sx;
    sy = -sy;
  }
  const area = flipArea(el);
  const offX = sx < 0 ? -sx * (area.x * 2 + area.width) : 0;
  const offY = sy < 0 ? -sy * (area.y * 2 + area.height) : 0;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    result: {
      ...result,
      x: result.x - (offX * cos - offY * sin),
      y: result.y - (offX * sin + offY * cos),
      rotation,
      scaleX: Math.abs(sx),
      scaleY: Math.abs(sy),
    },
    flip: {
      flipX: (el.flipX === true) !== sx < 0,
      flipY: (el.flipY === true) !== sy < 0,
    },
  };
}

/** Konva가 준 회전이 원래 회전에서 90°보다 멀리 돌았나 — 그러면 180° 더 돈 표현이 원래 뜻이다. */
function turnedHalf(el: Attrs, rotation: number): boolean {
  return Math.abs(normalizeDeg(rotation - num(el, "rotation", 0))) > 90;
}

/** (−180, 180] */
function normalizeDeg(deg: number): number {
  const d = ((deg % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

export type ElementPatch = { id: string; patch: Attrs };

/**
 * 그룹 크기 조절 — scale을 **자손 전부의 좌표·크기로** 흡수한다.
 *
 * 그룹은 자기 폭·높이로 자식을 담지 않는다. 자식이 페이지 좌표를 들고 있고(G0 계약),
 * Konva는 그룹 scale을 자식 로컬 좌표에 곱해서 그린다. 그러니 scale을 지우면서 그림을
 * 그대로 두려면 **자식 x/y까지 같은 비율로** 곱해야 한다.
 *
 * ```
 * 보이는 자리 = group.x + child.x × scaleX
 *            = group.x + (child.x × scaleX) × 1      ← scale을 자식에 흡수
 * ```
 *
 * 트랜스포머가 잡아 준 `result.x/y`가 이미 기준점 보정을 담고 있으므로 그룹 자신은
 * 그 값을 그대로 받는다. 중첩 그룹도 같은 규칙이 재귀로 성립한다 —
 * `(g + c) × s = g×s + c×s`.
 *
 * 글자 크기는 잎에서와 같은 규칙이다. 모서리 손잡이(가로세로 같은 비율)면 같이 커지고,
 * 옆 손잡이면 상자만 넓어진다.
 */
export function groupResizePatches(
  group: CanvasElement,
  result: TransformResult,
): ElementPatch[] {
  const sx = result.scaleX;
  const sy = result.scaleY;
  const uniform = Math.abs(sx - sy) < 0.001;
  const scaled = Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001;

  const out: ElementPatch[] = [
    {
      id: group.id,
      patch: {
        x: result.x,
        y: result.y,
        width: Math.max(1, result.width * sx),
        height: Math.max(1, result.height * sy),
        rotation: result.rotation,
      },
    },
  ];
  if (!scaled) return out;

  const walk = (list: ReadonlyArray<CanvasElement>) => {
    for (const child of list) {
      const patch: Attrs = {
        x: num(child, "x", 0) * sx,
        y: num(child, "y", 0) * sy,
        width: Math.max(1, num(child, "width", 0) * sx),
        height: Math.max(1, num(child, "height", 0) * sy),
      };
      if (child.type === "text" && uniform) {
        patch.fontSize = num(child, "fontSize", 14) * sx;
      }
      out.push({ id: child.id, patch });
      if (child.isContainer) walk(child.children);
    }
  };
  walk(group.children);
  return out;
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

/** 손가락 누르기 하나. `id` 는 누른 요소(선택 상자 위면 지금 고른 것). */
export type Tap = { at: number; x: number; y: number; id: string };

/** 두 번 누르기로 볼 간격·흔들림. Konva 의 `dblClickWindow`(400ms)와 맞췄다. */
export const DOUBLE_TAP_MS = 400;
export const DOUBLE_TAP_PX = 24;

/** 같은 요소를, 충분히 빨리, 거의 같은 자리에서 두 번 눌렀는가. */
export function isDoubleTap(prev: Tap | null, next: Tap): boolean {
  return (
    prev !== null &&
    prev.id === next.id &&
    next.at - prev.at <= DOUBLE_TAP_MS &&
    Math.hypot(next.x - prev.x, next.y - prev.y) <= DOUBLE_TAP_PX
  );
}
