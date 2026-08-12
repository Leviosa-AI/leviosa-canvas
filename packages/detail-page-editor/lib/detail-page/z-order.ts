/**
 * 정렬 순서(z-order) 한 벌. 우측 패널과 캔버스 우클릭 메뉴가 같은 규칙을 쓴다.
 *
 * **``element.moveUp()`` 을 쓰면 안 된다.** 스톡 편집기의 그 액션은 `e.page`를 기준으로
 * 삼아서, 그룹 **안** 요소에 대고 부르면 조용히 아무 일도 안 한다(no-op). 우리 문서는
 * 대부분이 그룹이라 그 경로는 실질적으로 죽은 경로다. 직접 부모(그룹 또는 페이지)가
 * 공통으로 노출하는 ``setElementZIndex(id, index)``만 쓴다. index가 클수록 앞이다.
 */

export type ZOrderParent = {
  children?: ReadonlyArray<{ id: string }>;
  setElementZIndex?: (id: string, index: number) => void;
};

export type ZOrderElement = {
  id: string;
  zIndex?: number;
  parent?: ZOrderParent | null;
};

export type ZOrder = {
  /** 형제 중 몇 번째인가(0 = 맨 뒤). */
  z: number;
  /** 형제 수. */
  count: number;
  atFront: boolean;
  atBack: boolean;
};

/** 순서를 만질 수 있는 요소인가 — 아니면 null(컨트롤을 아예 안 그린다). */
export function zOrderOf(el: ZOrderElement | undefined | null): ZOrder | null {
  const parent = el?.parent;
  if (!el || !parent?.setElementZIndex) return null;
  const siblings = parent.children ?? [];
  const count = siblings.length;
  // zIndex 게터가 있으면 그걸 믿는다(mobx 관찰 대상). 없으면 형제 배열에서 찾는다.
  const z =
    typeof el.zIndex === "number"
      ? el.zIndex
      : siblings.findIndex((c) => c.id === el.id);
  if (count <= 1 || z < 0) return null;
  return { z, count, atFront: z >= count - 1, atBack: z <= 0 };
}

export type ZMove = "front" | "forward" | "backward" | "back";

/** 목표 index. 범위 밖 요청은 끝으로 눌러 담는다. */
export function zTarget(order: ZOrder, move: ZMove): number {
  const raw =
    move === "front"
      ? order.count - 1
      : move === "back"
        ? 0
        : move === "forward"
          ? order.z + 1
          : order.z - 1;
  return Math.max(0, Math.min(order.count - 1, raw));
}

/** 그 방향으로 더 갈 데가 있는가 — 버튼/메뉴 항목 비활성 판정. */
export function canMoveZ(order: ZOrder | null, move: ZMove): boolean {
  if (!order) return false;
  return move === "front" || move === "forward" ? !order.atFront : !order.atBack;
}

/** 실제로 옮긴다. 움직일 데가 없으면 false(호출부가 아무 것도 안 해도 되게). */
export function moveZ(el: ZOrderElement, move: ZMove): boolean {
  const order = zOrderOf(el);
  if (!canMoveZ(order, move)) return false;
  el.parent?.setElementZIndex?.(el.id, zTarget(order!, move));
  return true;
}

/** 임의의 자리로. 우측 패널의 "n/총" 표시와 짝. */
export function setZ(el: ZOrderElement, index: number): void {
  const order = zOrderOf(el);
  if (!order) return;
  el.parent?.setElementZIndex?.(
    el.id,
    Math.max(0, Math.min(order.count - 1, index)),
  );
}
