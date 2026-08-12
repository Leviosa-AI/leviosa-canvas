/**
 * 레이어 트리에서 요소를 끌어 옮긴다 — 같은 부모 안 순서 바꾸기, 그룹 안으로 넣기,
 * 그룹 밖으로 빼기 (Figma의 레이어 패널과 같은 조작).
 *
 * **왜 이렇게 도는가.** 스톡 편집기에는 요소의 부모를 바꾸는 공개 API가 없다.
 * ``page.addElement``는 페이지에만 있고, ``setElementZIndex``는 같은 부모 안에서만
 * 자리를 옮긴다. 부모를 바꾸는 유일한 공개 수단이 ``ungroupElements`` /
 * ``groupElements`` 다 — 실제로 Canvas 내부도 이 둘에서만 MST ``detach``로 노드를
 * 다른 부모에 옮겨 붙인다. 그래서 그룹을 **해체했다가 원하는 자식 목록으로 다시
 * 묶는다**. ``groupElements(ids, attrs)``의 attrs가 기본값을 덮으므로 **그룹 id와
 * name·custom을 그대로 넘겨** 같은 그룹으로 되살릴 수 있다(문서·계약이 그룹 id를
 * 참조하므로 id 보존이 핵심이다). 자식 순서는 넘긴 ids 순서 그대로다.
 *
 * 해체·재구성한 그룹은 페이지 맨 끝(맨 앞)으로 붙으므로, 원래 있던 칸을 다시 세어
 * 되돌린다. 삭제·이동으로 인덱스가 밀리니 "원래 내 앞에 있었고 지금도 살아있는 것"의
 * 개수로 목표 칸을 구한다.
 *
 * **한계.** 페이지 직속 그룹만 다룬다. ``ungroupElements``는 자식을 ``e.page`` 로
 * 올려버려서 중첩 그룹에 쓰면 계층이 납작해지고 엉뚱한 요소가 지워진다. 중첩 그룹이
 * 얽힌 이동은 ``false``를 돌려주고 아무것도 건드리지 않는다.
 */

// children은 호출자마다 타입이 다르게 잡혀 있어(Canvas 모델·테스트 픽스처) unknown으로
// 받고 ``kids()`` 한 곳에서만 배열로 좁힌다.
export type LayerElement = {
  id: string;
  type?: string;
  children?: unknown;
  toJSON?: () => Record<string, unknown>;
};

type ParentLike = {
  id?: string;
  children?: unknown;
  setElementZIndex?: (id: string, index: number) => void;
};

type StoreLike = {
  activePage?: ParentLike;
  selectElements?: (ids: string[]) => void;
  groupElements?: (ids: string[], attrs?: Record<string, unknown>) => unknown;
  ungroupElements?: (ids: string[]) => void;
  history?: { transaction?: (fn: () => void) => unknown };
};

/** 드롭 지점: 어느 부모의(페이지는 null) 몇 번째 칸인가. index가 클수록 앞. */
export type DropSpot = { parentId: string | null; index: number };

/** 행에서 끌어놓는 위치. 목록은 앞→뒤 역순이라 before가 "더 앞". */
export type DropZone = "before" | "after" | "inside";

function kids(node: ParentLike | LayerElement | null | undefined): LayerElement[] {
  return Array.isArray(node?.children) ? (node?.children as LayerElement[]) : [];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** ``id``의 직접 부모(페이지 직속이면 null)와 그 부모 안 인덱스. 없으면 null. */
export function locate(
  page: ParentLike,
  id: string,
): { parent: LayerElement | null; index: number } | null {
  const walk = (
    list: LayerElement[],
    parent: LayerElement | null,
  ): { parent: LayerElement | null; index: number } | null => {
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].id === id) return { parent, index: i };
      const found = walk(kids(list[i]), list[i]);
      if (found) return found;
    }
    return null;
  };
  return walk(kids(page), null);
}

function elementById(page: ParentLike, id: string): LayerElement | null {
  const walk = (list: LayerElement[]): LayerElement | null => {
    for (const el of list) {
      if (el.id === id) return el;
      const found = walk(kids(el));
      if (found) return found;
    }
    return null;
  };
  return walk(kids(page));
}

function contains(root: LayerElement | null, id: string): boolean {
  if (!root) return false;
  return kids(root).some((child) => child.id === id || contains(child, id));
}

/**
 * 놓은 행과 위치를 실제 드롭 지점으로 바꾼다.
 *
 * 목록은 앞(위)에 그려지는 것이 맨 위로 오도록 뒤집어 그리므로, 화면에서 "행 위"는
 * 모델에서 그 행보다 **뒤 인덱스**(더 앞)다. 인덱스는 끌고 있는 요소를 뺀 목록 기준
 * (``setElementZIndex``가 빼고 끼우는 것과 같은 계약)이다.
 */
export function dropSpot(
  page: ParentLike,
  rowId: string,
  zone: DropZone,
  dragId: string,
): DropSpot | null {
  if (!rowId || !dragId || rowId === dragId) return null;
  const row = elementById(page, rowId);
  if (!row) return null;

  if (zone === "inside") {
    if (row.type !== "group") return null;
    // 그룹 안에서는 맨 앞에 얹는다(Figma와 같다).
    return { parentId: row.id, index: kids(row).length };
  }

  const at = locate(page, rowId);
  if (!at) return null;
  const parent = at.parent;
  const siblings = kids(parent ?? page)
    .map((el) => el.id)
    .filter((id) => id !== dragId);
  const i = siblings.indexOf(rowId);
  if (i < 0) return null;
  return { parentId: parent?.id ?? null, index: zone === "before" ? i + 1 : i };
}

/** 그룹을 되살릴 때 쓸 속성. children은 빼고(재구성할 목록으로 대체) id는 지킨다. */
function groupAttrs(group: LayerElement): Record<string, unknown> {
  const raw =
    typeof group.toJSON === "function"
      ? { ...group.toJSON() }
      : ({ ...group } as Record<string, unknown>);
  delete raw.children;
  raw.id = group.id;
  return raw;
}

/**
 * 재구성으로 페이지 끝에 붙은 요소를 원래 칸으로 되돌린다.
 *
 * ``beforeIds``는 손대기 전 페이지 직속 id 목록, ``originalIndex``는 그 안에서의 자리.
 * 그 앞에 있었고 **지금도 남아 있는** 것의 수가 곧 목표 칸이다.
 */
function restorePageSlot(
  page: ParentLike,
  id: string,
  beforeIds: string[],
  originalIndex: number,
): void {
  if (!page.setElementZIndex || originalIndex < 0) return;
  const alive = new Set(kids(page).map((el) => el.id));
  if (!alive.has(id)) return;
  let target = 0;
  for (let i = 0; i < originalIndex; i += 1) {
    if (alive.has(beforeIds[i])) target += 1;
  }
  page.setElementZIndex(id, target);
}

function runInTransaction(store: StoreLike, fn: () => void): void {
  const transaction = store.history?.transaction;
  if (typeof transaction !== "function") {
    fn();
    return;
  }
  // 해체·재구성이 여러 액션으로 나뉘어도 undo 한 번에 되돌아가게 묶는다.
  transaction.call(store.history, fn);
}

/**
 * ``dragId``를 ``spot``으로 옮긴다. 옮겼으면 true.
 *
 * 실패(중첩 그룹, 자기 자손으로 넣기, 필요한 API 없음)하면 아무것도 바꾸지 않고 false.
 */
export function moveLayer(store: unknown, dragId: string, spot: DropSpot): boolean {
  const s = store as StoreLike;
  const page = s.activePage;
  if (!page || !dragId) return false;

  const from = locate(page, dragId);
  if (!from) return false;

  const srcParentId = from.parent?.id ?? null;
  const dstParentId = spot.parentId ?? null;

  // 자기 자신 또는 자기 자손 안으로는 넣을 수 없다(트리가 끊긴다).
  if (dstParentId === dragId) return false;
  if (dstParentId && contains(elementById(page, dragId), dstParentId)) return false;

  if (srcParentId === dstParentId) {
    const parent = (from.parent ?? page) as ParentLike;
    if (!parent.setElementZIndex) return false;
    const count = kids(parent).length;
    parent.setElementZIndex(dragId, clamp(spot.index, 0, Math.max(0, count - 1)));
    return true;
  }

  const srcGroup = from.parent;
  const dstGroup = dstParentId ? elementById(page, dstParentId) : null;
  if (dstParentId && (!dstGroup || dstGroup.type !== "group")) return false;

  // 페이지 직속 그룹만 해체·재구성할 수 있다(위 주석의 한계).
  const pageIds = kids(page).map((el) => el.id);
  if (srcGroup && !pageIds.includes(srcGroup.id)) return false;
  if (dstGroup && !pageIds.includes(dstGroup.id)) return false;
  if (typeof s.ungroupElements !== "function" || typeof s.groupElements !== "function") {
    return false;
  }

  const srcIndex = srcGroup ? pageIds.indexOf(srcGroup.id) : -1;
  const dstIndex = dstGroup ? pageIds.indexOf(dstGroup.id) : -1;
  const srcAttrs = srcGroup ? groupAttrs(srcGroup) : null;
  const dstAttrs = dstGroup ? groupAttrs(dstGroup) : null;
  const srcRemaining = srcGroup
    ? kids(srcGroup)
        .map((el) => el.id)
        .filter((id) => id !== dragId)
    : [];
  const dstNext = dstGroup ? kids(dstGroup).map((el) => el.id) : [];
  if (dstGroup) dstNext.splice(clamp(spot.index, 0, dstNext.length), 0, dragId);

  runInTransaction(s, () => {
    if (srcGroup) {
      s.ungroupElements?.([srcGroup.id]);
      // 자식이 하나도 안 남으면 빈 그룹을 되살리지 않는다(Figma와 같다).
      if (srcRemaining.length > 0) s.groupElements?.(srcRemaining, srcAttrs ?? {});
    }
    if (dstGroup) {
      s.ungroupElements?.([dstGroup.id]);
      s.groupElements?.(dstNext, dstAttrs ?? {});
    }

    // 되살린 그룹들을 원래 칸으로. 원래 인덱스가 작은 것부터 처리해야 자리가 안 밀린다.
    const restore: Array<{ id: string; index: number }> = [];
    if (srcGroup && srcRemaining.length > 0) {
      restore.push({ id: srcGroup.id, index: srcIndex });
    }
    if (dstGroup) restore.push({ id: dstGroup.id, index: dstIndex });
    restore
      .sort((a, b) => a.index - b.index)
      .forEach((item) => restorePageSlot(page, item.id, pageIds, item.index));

    // 그룹 밖으로 나온 경우엔 페이지에서의 칸도 정해준다.
    if (!dstGroup && page.setElementZIndex) {
      const count = kids(page).length;
      page.setElementZIndex(dragId, clamp(spot.index, 0, Math.max(0, count - 1)));
    }

    // group/ungroup이 선택을 바꿔놓으므로 끌던 요소로 되돌린다.
    s.selectElements?.([dragId]);
  });

  return true;
}
