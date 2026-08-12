/**
 * 캔버스 우클릭 메뉴의 항목 구성과 동작. UI와 떼어 놓아 규칙만 테스트한다.
 *
 * 스톡 편집기는 ``canvas/canvas/context-menu``에 자기 메뉴를 갖고 있지만 ``page.js``가
 * ``contextmenu``를 한 번도 안 단다 — 스톡 ``<Workspace>``가 달던 것이고, 우리는 그
 * ``<Workspace>``를 갈아치웠다. 스톡 메뉴를 되살리지 않는 이유는 두 가지다.
 *
 * 1. 블루프린트 팝오버라 캔버스 위 다른 오버레이(전부 Tailwind)와 안 맞는다.
 * 2. 항목이 모자란다. 그룹/해제가 없고, ``useCopyStyle``을 import 해 놓고 실제로는
 *    쓰지 않는다(죽은 코드). 우리 문서는 대부분이 그룹이라 그룹 해제가 꼭 필요하다.
 */

import { groupAction } from "./group-action";
import {
  applyFormat,
  canCopyFormat,
  canPasteFormat,
  copyFormat,
  heldFormat,
  holdFormat,
} from "./format-painter";
import { canMoveZ, moveZ, zOrderOf, type ZOrderElement } from "./z-order";

export type CanvasMenuAction =
  | "duplicate"
  | "delete"
  | "lock"
  | "unlock"
  | "copyFormat"
  | "pasteFormat"
  | "front"
  | "forward"
  | "backward"
  | "back"
  | "group"
  | "ungroup";

export type CanvasMenuItem = {
  action: CanvasMenuAction;
  disabled: boolean;
  /** 이 항목 **위에** 구분선을 긋는다. */
  separated?: boolean;
};

export type MenuElement = ZOrderElement & {
  type?: string;
  locked?: boolean;
  clone?: (attrs?: Record<string, unknown>, opts?: { skipSelect?: boolean }) => unknown;
  set?: (props: Record<string, unknown>) => void;
};

export type CanvasMenuStore = {
  selectedElements?: MenuElement[];
  selectedElementsIds?: string[];
  pages?: Array<{ id: string; children?: Array<{ id: string; type?: string }> }>;
  deleteElements?: (ids: string[]) => void;
  groupElements?: (ids: string[]) => void;
  ungroupElements?: (ids: string[]) => void;
  history?: { startTransaction?: () => void; endTransaction?: () => void };
};

/** 선택 요소가 전부 잠겨 있는가 — 메뉴에 잠금 대신 잠금 해제를 띄운다. */
export function allLocked(els: ReadonlyArray<MenuElement>): boolean {
  return els.length > 0 && els.every((el) => el.locked === true);
}

/**
 * 지금 선택에 대해 띄울 항목들. 선택이 없으면 빈 배열 = 메뉴를 아예 안 연다.
 *
 * 순서는 z-order를 **단일 선택일 때만** 낸다. 여럿을 한꺼번에 "앞으로" 보내면 서로의
 * 상대 순서가 어떻게 되어야 하는지가 모호하고, 우측 패널도 같은 이유로 단일 전용이다.
 */
export function canvasMenuItems(store: CanvasMenuStore): CanvasMenuItem[] {
  const els = store.selectedElements ?? [];
  if (els.length === 0) return [];

  const locked = allLocked(els);
  const anyLocked = els.some((el) => el.locked === true);
  const single = els.length === 1 ? els[0] : null;
  const order = single ? zOrderOf(single) : null;
  const group = groupAction(store, false);
  const ungroup = groupAction(store, true);

  const items: CanvasMenuItem[] = [
    // 잠긴 요소를 복제하면 잠긴 사본이 생겨 만질 수도 지울 수도 없다.
    { action: "duplicate", disabled: anyLocked },
    { action: locked ? "unlock" : "lock", disabled: false },
    { action: "delete", disabled: anyLocked },
    // 서식은 하나에서 떠서 여럿에 먹인다 — 복사는 단일 선택일 때만.
    { action: "copyFormat", disabled: !single || !canCopyFormat(single), separated: true },
    {
      action: "pasteFormat",
      disabled: anyLocked || !canPasteFormat(heldFormat(), els),
    },
    { action: "front", disabled: !canMoveZ(order, "front"), separated: true },
    { action: "forward", disabled: !canMoveZ(order, "forward") },
    { action: "backward", disabled: !canMoveZ(order, "backward") },
    { action: "back", disabled: !canMoveZ(order, "back") },
  ];

  // 그룹/해제는 해당될 때만 낸다 — 늘 회색으로 떠 있으면 메뉴만 길어진다.
  if (group?.kind === "group") {
    items.push({ action: "group", disabled: false, separated: true });
  }
  if (ungroup?.kind === "ungroup") {
    items.push({
      action: "ungroup",
      disabled: false,
      separated: group?.kind !== "group",
    });
  }
  return items;
}

/**
 * 한 항목을 실행한다.
 *
 * 여러 요소를 한 번에 만지는 동작(복제·잠금)은 히스토리 트랜잭션으로 묶는다. 안 묶으면
 * ⌘Z를 선택 개수만큼 눌러야 원래대로 돌아간다.
 */
export function runCanvasMenuAction(
  store: CanvasMenuStore,
  action: CanvasMenuAction,
): void {
  const els = store.selectedElements ?? [];
  if (els.length === 0) return;
  const ids = els.map((el) => el.id);

  const inTransaction = (fn: () => void) => {
    store.history?.startTransaction?.();
    try {
      fn();
    } finally {
      store.history?.endTransaction?.();
    }
  };

  switch (action) {
    case "duplicate":
      // clone()은 항상 요소의 **페이지**에 추가한다(node-model: e.page.addElement).
      // 그룹 자식의 x/y도 페이지 좌표라, 그룹 안 도형을 복제하면 제자리에 사본이
      // 생기고 최상위로 나온다 — 그룹을 오염시키지 않는 편이 낫다.
      inTransaction(() => {
        for (const el of els) el.clone?.({}, { skipSelect: true });
      });
      return;
    case "delete":
      store.deleteElements?.(ids);
      return;
    case "copyFormat":
      if (els.length === 1) holdFormat(copyFormat(els[0]));
      return;
    case "pasteFormat": {
      const copied = heldFormat();
      // 여럿에 한 번에 먹일 때 ⌘Z 한 번으로 전부 돌아가게 묶는다.
      if (copied) inTransaction(() => applyFormat(copied, els));
      return;
    }
    case "lock":
    case "unlock":
      inTransaction(() => {
        for (const el of els) el.set?.({ locked: action === "lock" });
      });
      return;
    case "front":
    case "forward":
    case "backward":
    case "back":
      if (els.length === 1) moveZ(els[0], action);
      return;
    case "group": {
      const plan = groupAction(store, false);
      if (plan?.kind === "group") store.groupElements?.(plan.ids);
      return;
    }
    case "ungroup": {
      const plan = groupAction(store, true);
      if (plan?.kind === "ungroup") store.ungroupElements?.(plan.ids);
      return;
    }
  }
}
