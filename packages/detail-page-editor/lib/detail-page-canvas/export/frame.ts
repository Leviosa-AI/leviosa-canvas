// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
/**
 * 내보내기가 화면과 같은 자리에 그리려고 쓰는 셈 두 가지.
 *
 * 1. **요소 행렬.** 화면(Konva)은 요소를 `x/y`로 옮기고 그 자리를 축으로 `rotation`만큼
 *    돌린다. 그룹도 똑같이 하고 자식은 그 안에 얹힌다 — 그룹을 옮기거나 돌리면 자식도
 *    따라온다. 여기서는 그 누적을 행렬 하나로 들고 다닌다.
 * 2. **사진 자르기.** 문서의 `crop*`을 원본에서 오려 올 자리로 바꾸는 셈은 렌더러
 *    (`@leviosa-ai/canvas/render/image-frame`)의 것을 그대로 쓴다 — 여기서 다시 적으면
 *    언젠가 둘이 갈라진다.
 */

import {
  hasDocumentCrop,
  imageFrame,
  type Rect,
  type Size,
} from "@leviosa-ai/canvas/render/image-frame";
import type { Attrs } from "@leviosa-ai/canvas/types";

import type { ExportElement } from "./document-model";

export type { Rect, Size };

/** 캔버스 `setTransform` 순서: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** m · n — n을 먼저 먹이고 m을 먹인다. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function applyMatrix(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** 회전 없이 옮기기만 하는 행렬인가. */
export function isTranslation(m: Matrix): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1;
}

/**
 * 요소의 로컬 좌표(상자 왼쪽 위가 0,0) → 부모 좌표. `parent · T(x, y) · R(rotation)`.
 * 그룹이면 이 행렬이 자식들의 부모 행렬이 된다.
 */
export function elementMatrix(el: ExportElement, parent: Matrix = IDENTITY): Matrix {
  const rad = (num(el.rotation) * Math.PI) / 180;
  // 0°·90° 같은 각에서 cos/sin 꼬리(6e-17)가 붙어 isTranslation이 틀리지 않게 다듬는다.
  const cos = Math.abs(Math.cos(rad)) < 1e-12 ? 0 : Math.cos(rad);
  const sin = Math.abs(Math.sin(rad)) < 1e-12 ? 0 : Math.sin(rad);
  return multiply(parent, [cos, sin, -sin, cos, num(el.x), num(el.y)]);
}

/**
 * 문서 crop이 있으면 원본에서 오려 올 자리(`source`, 원본 px)와 그 자리를 그릴 곳
 * (`dest`, 상자 로컬 px). 없으면 null — 호출자는 제 objectFit 규칙대로 그린다.
 *
 * 렌더러처럼 `stretchEnabled`가 crop보다 먼저다(늘여 그리라는 지시가 이긴다).
 */
export function documentCropFrame(
  el: ExportElement,
  natural: Size,
  box: Size,
): { source: Rect; dest: Rect } | null {
  const attrs = el as Attrs;
  if (attrs.stretchEnabled === true || !hasDocumentCrop(attrs)) return null;
  const frame = imageFrame(attrs, natural, box, false);
  return frame.crop ? { source: frame.crop, dest: frame.dest } : null;
}
