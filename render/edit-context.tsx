"use client";

/**
 * 렌더 트리 어디서든 "지금 편집 중인가, 무엇을 집을 수 있는가"를 알 수 있게 하는 통로.
 *
 * 요소 뷰가 스토어를 직접 만지지 않게 하려는 것이다 — 뷰는 그리기만 하고, 끌어 놓은
 * 결과를 문서에 되돌려 쓰는 일은 한 군데(작업 영역)에서만 한다.
 */

import { createContext, useContext } from "react";

import type { TransformResult } from "./interaction";

export type EditHandlers = {
  /** 읽기 전용 미리보기면 false — 이때는 노드가 이벤트도 안 받는다. */
  interactive: boolean;
  /** 지금 안쪽을 보고 있는 그룹. 없으면 최상위만 집힌다. */
  scopeId: string | null;
  /** 지금 글자를 고치고 있는 요소 — 캔버스는 그 글자를 안 그린다(편집기가 그린다). */
  editingId: string | null;
  onDragEnd: (id: string, position: { x: number; y: number }) => void;
  onTransformEnd: (id: string, result: TransformResult) => void;
};

export const EditContext = createContext<EditHandlers | null>(null);

export function useEditHandlers(): EditHandlers | null {
  return useContext(EditContext);
}
