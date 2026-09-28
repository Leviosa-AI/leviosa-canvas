// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
/**
 * 레이어 트리에서 요소를 끌어 옮긴다 — 같은 부모 안 순서 바꾸기, 그룹 안으로 넣기,
 * 그룹 밖으로 빼기 (Figma의 레이어 패널과 같은 조작).
 *
 * **어떻게 옮기는가.** 엔진에는 부모를 바꾸는 API가 따로 없다. 대신 페이지와 그룹이
 * 둘 다 ``addElement(json, { index })`` 를 갖고 있고 json 의 id 를 그대로 쓰므로,
 * 떼어 낸(``deleteElements``) 요소를 새 부모의 원하는 칸에 **같은 id로** 다시 붙인다.
 * 트랜잭션 하나로 묶어 undo 한 번에 돌아간다.
 *
 * 예전에는 그룹을 해체했다가 다시 묶었다. 스톡 편집기의 ``ungroupElements`` 가 자식을
 * 페이지로 올려 버려서 **페이지 직속 그룹만** 다룰 수 있었고, 중첩 그룹이 얽히면
 * 아무 말 없이 안 옮겼다. 지금 길은 깊이를 안 가린다.
 *
 * 자식 x/y 는 부모(그룹) 원점 기준이다. 부모가 바뀌면 두 원점의 차이만큼 옮겨서
 * 화면 자리를 지킨다. ponytail: 조상 그룹의 회전·배율은 안 본다 — 엔진의 절대 좌표도
 * x/y 만 더한다(``absolutePosition``). 회전된 그룹을 드나들면 자리가 틀어진다.
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
  addElement?: (json: Record<string, unknown>, options?: { index?: number }) => unknown;
};

type StoreLike = {
  activePage?: ParentLike;
  selectElements?: (ids: string[]) => void;
  deleteElements?: (ids: string[]) => void;
  history?: { startTransaction?: () => void; endTransaction?: () => void };
};

/** 옮기기를 거절한 이유. 레이어 패널이 이걸 문구로 바꿔 알린다. */
export type MoveRefusal = "missing" | "intoSelf" | "notGroup" | "unsupported";

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

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** ``id`` 그룹 안 좌표계의 원점(페이지 기준). 페이지면 0. */
function originOf(page: ParentLike, id: string | null): { x: number; y: number } {
  if (!id) return { x: 0, y: 0 };
  const walk = (list: LayerElement[]): { x: number; y: number } | null => {
    for (const el of list) {
      const own = el as { x?: unknown; y?: unknown };
      if (el.id === id) return { x: num(own.x), y: num(own.y) };
      const inner = walk(kids(el));
      if (inner) return { x: inner.x + num(own.x), y: inner.y + num(own.y) };
    }
    return null;
  };
  return walk(kids(page)) ?? { x: 0, y: 0 };
}

/**
 * ``dragId``를 ``spot``으로 옮길 수 없는 이유. 옮길 수 있으면 null.
 *
 * 패널이 드롭 전에 불러 "왜 안 되는지"를 알린다 — 예전엔 조용히 아무 일도 안 일어나서
 * 사람이 드래그를 몇 번이고 다시 했다.
 */
export function whyNotMove(
  store: unknown,
  dragId: string,
  spot: DropSpot,
): MoveRefusal | null {
  const s = store as StoreLike;
  const page = s.activePage;
  if (!page || !dragId) return "missing";
  const from = locate(page, dragId);
  if (!from) return "missing";

  const dstParentId = spot.parentId ?? null;
  // 자기 자신 또는 자기 자손 안으로는 넣을 수 없다(트리가 끊긴다).
  if (dstParentId === dragId) return "intoSelf";
  if (dstParentId && contains(elementById(page, dragId), dstParentId)) return "intoSelf";

  const dst = dstParentId ? elementById(page, dstParentId) : page;
  if (!dst) return "missing";
  if (dstParentId && (dst as LayerElement).type !== "group") return "notGroup";

  if ((from.parent?.id ?? null) === dstParentId) {
    return (from.parent ?? page).setElementZIndex ? null : "unsupported";
  }
  if (typeof (dst as ParentLike).addElement !== "function") return "unsupported";
  if (typeof s.deleteElements !== "function") return "unsupported";
  return null;
}

function runInTransaction(store: StoreLike, fn: () => void): void {
  // 떼기·붙이기가 여러 변경으로 나뉘어도 undo 한 번에 되돌아가게 묶는다.
  store.history?.startTransaction?.();
  try {
    fn();
  } finally {
    store.history?.endTransaction?.();
  }
}

/**
 * ``dragId``를 ``spot``으로 옮긴다. 옮겼으면 true.
 *
 * 옮길 수 없으면(``whyNotMove``) 아무것도 바꾸지 않고 false.
 */
export function moveLayer(store: unknown, dragId: string, spot: DropSpot): boolean {
  if (whyNotMove(store, dragId, spot)) return false;
  const s = store as StoreLike;
  const page = s.activePage as ParentLike;
  const from = locate(page, dragId)!;
  const srcParent = from.parent;
  const dstParentId = spot.parentId ?? null;

  if ((srcParent?.id ?? null) === dstParentId) {
    const parent = (srcParent ?? page) as ParentLike;
    const count = kids(parent).length;
    parent.setElementZIndex?.(dragId, clamp(spot.index, 0, Math.max(0, count - 1)));
    return true;
  }

  const dst = (dstParentId ? elementById(page, dstParentId) : page) as ParentLike;
  const el = kids(srcParent ?? page)[from.index];
  const json: Record<string, unknown> =
    typeof el.toJSON === "function" ? { ...el.toJSON() } : { ...el };
  json.id = dragId;
  // 부모 원점이 바뀐다 — 화면 자리를 지키려면 두 원점의 차이만큼 옮긴다.
  const a = originOf(page, srcParent?.id ?? null);
  const b = originOf(page, dstParentId);
  json.x = num(json.x) + a.x - b.x;
  json.y = num(json.y) + a.y - b.y;

  runInTransaction(s, () => {
    s.deleteElements?.([dragId]);
    // 자식이 하나도 안 남은 그룹은 지운다(Figma와 같다).
    if (srcParent && kids(srcParent).length === 0) s.deleteElements?.([srcParent.id]);
    dst.addElement?.(json, { index: clamp(spot.index, 0, kids(dst).length) });
    // 지우기가 선택을 풀어 놓으므로 끌던 요소로 되돌린다.
    s.selectElements?.([dragId]);
  });

  return true;
}
