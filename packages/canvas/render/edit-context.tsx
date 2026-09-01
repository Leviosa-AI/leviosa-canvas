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
  /** 끌기 시작 — 스냅 상대를 이때 한 번만 모은다(움직일 때마다 다시 모으면 느리다). */
  /**
   * 끌기 시작. `node` 는 끌리는 Konva 노드다 — 그 자리에서 그림 한 장으로 떠서
   * 무대 밖에서도 «그 요소 그대로» 보여 주는 데 쓴다.
   */
  onDragStart: (
    id: string,
    node?: { toDataURL: (config?: { pixelRatio?: number }) => string },
  ) => void;
  /**
   * 끄는 중. **붙일 자리를 되돌려 준다** — 부르는 쪽(요소 뷰)이 그 자리로 노드를 옮긴다.
   * 문서는 아직 안 고친다(끌기 한 번이 히스토리 한 줄이어야 한다).
   */
  onDragMove: (
    id: string,
    position: { x: number; y: number },
  ) => { x: number; y: number };
  /**
   * 끌기 끝. `altClone`이면 원래 자리에 복제본을 하나 남긴다(⌥ 끌기).
   *
   * `client`는 손을 뗀 **화면 좌표**다. 판마다 무대가 따로라, 다른 판 위에 놓았는지는
   * 문서 좌표로는 알 수 없다 — 그 좌표는 여전히 «원래 판 안»을 가리키기 때문이다.
   */
  onDragEnd: (
    id: string,
    position: { x: number; y: number },
    altClone?: boolean,
    client?: { x: number; y: number },
  ) => void;
  onTransformEnd: (id: string, result: TransformResult) => void;
};

export const EditContext = createContext<EditHandlers | null>(null);

export function useEditHandlers(): EditHandlers | null {
  return useContext(EditContext);
}
