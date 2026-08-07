/**
 * 요소가 페이지 위에서 실제로 차지하는 네모.
 *
 * 정렬·스냅·마퀴 선택이 전부 이 하나를 본다. 세 곳이 각자 재면 셋이 서로 다른 답을
 * 내놓는다 — 실제로 Polotno가 그랬다(정렬은 `getClientRect`, 스냅은 노드 좌표).
 *
 * 두 가지만 조심하면 된다.
 *
 * 1. **그룹은 자기 폭·높이를 안 믿는다.** 자식이 페이지 절대 좌표를 들고 있고(G0 계약)
 *    그룹의 `x/y`는 "그 뒤로 옮긴 양"이다. 그래서 그룹의 네모는 자식들의 합집합에
 *    그룹이 옮겨 간 만큼을 더한 것이다.
 * 2. **회전은 축에 나란한 네모로 감싼다.** Konva는 요소의 왼쪽 위를 축으로 돌리므로
 *    네 꼭짓점을 돌려 최소·최대를 잡는다.
 */

import type { CanvasElement } from "../store";
import { num } from "../types";

export type Rect = { x: number; y: number; width: number; height: number };

export function unionRect(rects: ReadonlyArray<Rect>): Rect | null {
  if (!rects.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** 회전을 감싸는 축 나란한 네모. 각도가 0이면 그대로 돌려준다. */
function boundsOf(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
): Rect {
  if (!rotation) return { x, y, width, height };
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ].map(([dx, dy]) => ({
    x: x + dx * cos - dy * sin,
    y: y + dx * sin + dy * cos,
  }));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

/**
 * 요소가 그려지는 자리(부모 좌표계 기준). 페이지 바로 밑 요소면 곧 페이지 좌표다.
 *
 * 그룹 안 요소를 홀로 재는 일은 정렬·스냅에 없다(그때는 그룹이 대상이다). 그래도
 * 필요하면 `absolutePosition`으로 조상 오프셋을 더해 쓰면 된다.
 */
export function elementRect(el: CanvasElement): Rect {
  const rotation = num(el, "rotation", 0);
  if (!el.isContainer || el.children.length === 0) {
    return boundsOf(
      num(el, "x", 0),
      num(el, "y", 0),
      num(el, "width", 0),
      num(el, "height", 0),
      rotation,
    );
  }
  const inner = unionRect(el.children.map((child) => elementRect(child)));
  if (!inner) return boundsOf(num(el, "x", 0), num(el, "y", 0), 0, 0, rotation);
  return {
    x: inner.x + num(el, "x", 0),
    y: inner.y + num(el, "y", 0),
    width: inner.width,
    height: inner.height,
  };
}

/**
 * 이 요소의 네모가 `(x, y)`에서 시작하도록 옮긴다.
 *
 * 그룹도 자기 `x/y`만 건드리면 된다 — 자식은 그룹 좌표에 얹혀 따라온다. Polotno는
 * 그룹을 옮길 때 자식을 하나씩 옮겼는데(`alignment.js`), 그건 그쪽 그룹이 옮긴 양을
 * 안 들고 있어서다.
 */
export function moveElementTo(el: CanvasElement, x: number, y: number): void {
  const rect = elementRect(el);
  const dx = x - rect.x;
  const dy = y - rect.y;
  if (!dx && !dy) return;
  el.set({ x: num(el, "x", 0) + dx, y: num(el, "y", 0) + dy });
}
