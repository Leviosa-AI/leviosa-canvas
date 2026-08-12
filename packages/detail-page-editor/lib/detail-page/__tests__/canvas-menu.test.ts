import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  allLocked,
  canvasMenuItems,
  runCanvasMenuAction,
  type CanvasMenuStore,
} from "../canvas-menu";
import { heldFormat, holdFormat } from "../format-painter";

type El = {
  id: string;
  type?: string;
  fontSize?: number;
  locked?: boolean;
  parent?: {
    children?: Array<{ id: string }>;
    setElementZIndex?: (id: string, index: number) => void;
  };
  clone?: (attrs?: Record<string, unknown>, opts?: { skipSelect?: boolean }) => unknown;
  set?: (props: Record<string, unknown>) => void;
};

/**
 * 최상위 요소 셋(a·b·c)이 놓인 페이지 하나. `selected`에 든 것들이 선택 상태다.
 * `types`로 특정 요소를 group으로 바꿀 수 있다(그룹 해제 판정용).
 */
function makeStore(
  selected: string[],
  opts: { locked?: string[]; types?: Record<string, string> } = {},
): CanvasMenuStore & { deleted: string[][]; grouped: string[][]; ungrouped: string[][]; zCalls: unknown[][]; els: Record<string, El> } {
  const ids = ["a", "b", "c"];
  const zCalls: unknown[][] = [];
  const parent = {
    children: ids.map((id) => ({ id })),
    setElementZIndex: (...args: unknown[]) => zCalls.push(args),
  };
  const els: Record<string, El> = {};
  for (const id of ids) {
    els[id] = {
      id,
      type: opts.types?.[id] ?? "text",
      // 진짜 Canvas 텍스트는 늘 서식 값을 갖고 있다 — 없으면 뜰 서식이 없어 붙이기가
      // 죽는데, 그건 이 테스트가 보려는 게 아니다.
      fontSize: 20,
      locked: opts.locked?.includes(id) ?? false,
      parent: parent as El["parent"],
      clone: vi.fn((_a?: Record<string, unknown>, _o?: { skipSelect?: boolean }) => undefined),
      set: vi.fn((_p: Record<string, unknown>) => undefined),
    };
  }
  const deleted: string[][] = [];
  const grouped: string[][] = [];
  const ungrouped: string[][] = [];
  return {
    els,
    deleted,
    grouped,
    ungrouped,
    zCalls,
    selectedElements: selected.map((id) => els[id]),
    selectedElementsIds: selected,
    pages: [{ id: "p", children: ids.map((id) => ({ id, type: els[id].type })) }],
    deleteElements: (list: string[]) => deleted.push(list),
    groupElements: (list: string[]) => grouped.push(list),
    ungroupElements: (list: string[]) => ungrouped.push(list),
    history: { startTransaction: vi.fn(), endTransaction: vi.fn() },
  };
}

// 서식 클립보드는 세션 모듈 상태다 — 테스트끼리 새면 판정이 뒤바뀐다.
beforeEach(() => holdFormat(null));

const actions = (store: CanvasMenuStore) => canvasMenuItems(store).map((i) => i.action);
const item = (store: CanvasMenuStore, action: string) =>
  canvasMenuItems(store).find((i) => i.action === action);

describe("canvasMenuItems", () => {
  it("선택이 없으면 메뉴를 안 연다", () => {
    expect(canvasMenuItems({ selectedElements: [] })).toEqual([]);
  });

  it("단일 선택: 복제·잠금·삭제·서식·순서 넷", () => {
    expect(actions(makeStore(["b"]))).toEqual([
      "duplicate",
      "lock",
      "delete",
      "copyFormat",
      "pasteFormat",
      "front",
      "forward",
      "backward",
      "back",
    ]);
  });

  it("맨 앞 요소는 앞으로 가는 항목이 죽는다", () => {
    const store = makeStore(["c"]);
    expect(item(store, "front")?.disabled).toBe(true);
    expect(item(store, "forward")?.disabled).toBe(true);
    expect(item(store, "back")?.disabled).toBe(false);
  });

  it("여럿 고르면 순서 항목은 전부 죽는다", () => {
    // 여럿을 한꺼번에 "앞으로" 보내면 서로의 상대 순서가 모호하다. 우측 패널도 같다.
    const store = makeStore(["a", "b"]);
    for (const a of ["front", "forward", "backward", "back"]) {
      expect(item(store, a)?.disabled).toBe(true);
    }
  });

  it("전부 잠겼으면 잠금 대신 잠금 해제", () => {
    const store = makeStore(["a", "b"], { locked: ["a", "b"] });
    expect(actions(store)).toContain("unlock");
    expect(actions(store)).not.toContain("lock");
  });

  it("하나라도 잠겼으면 복제·삭제가 죽는다", () => {
    // 잠긴 사본이 생기면 만질 수도 지울 수도 없다.
    const store = makeStore(["a", "b"], { locked: ["a"] });
    expect(item(store, "duplicate")?.disabled).toBe(true);
    expect(item(store, "delete")?.disabled).toBe(true);
    expect(item(store, "lock")).toBeTruthy(); // 섞였으면 잠그기 쪽
  });

  it("최상위 둘을 고르면 그룹 묶기가 뜬다", () => {
    expect(actions(makeStore(["a", "b"]))).toContain("group");
  });

  it("그룹 하나를 고르면 그룹 해제만 뜬다", () => {
    const store = makeStore(["a"], { types: { a: "group" } });
    expect(actions(store)).toContain("ungroup");
    expect(actions(store)).not.toContain("group");
  });

  it("일반 요소 하나만 고르면 그룹 항목이 아예 없다", () => {
    // 늘 회색으로 떠 있으면 메뉴만 길어진다.
    const store = makeStore(["b"]);
    expect(actions(store)).not.toContain("group");
    expect(actions(store)).not.toContain("ungroup");
  });
});

describe("allLocked", () => {
  it("빈 선택은 잠긴 게 아니다", () => {
    expect(allLocked([])).toBe(false);
  });
});

describe("runCanvasMenuAction", () => {
  it("복제는 선택 전부를 트랜잭션으로 묶는다", () => {
    // 안 묶으면 ⌘Z를 개수만큼 눌러야 되돌아간다.
    const store = makeStore(["a", "b"]);
    runCanvasMenuAction(store, "duplicate");
    expect(store.els.a.clone).toHaveBeenCalledWith({}, { skipSelect: true });
    expect(store.els.b.clone).toHaveBeenCalled();
    expect(store.history?.startTransaction).toHaveBeenCalledTimes(1);
    expect(store.history?.endTransaction).toHaveBeenCalledTimes(1);
  });

  it("잠금·잠금 해제가 locked를 반대로 쓴다", () => {
    const store = makeStore(["a"]);
    runCanvasMenuAction(store, "lock");
    expect(store.els.a.set).toHaveBeenCalledWith({ locked: true });
    runCanvasMenuAction(store, "unlock");
    expect(store.els.a.set).toHaveBeenCalledWith({ locked: false });
  });

  it("삭제는 id를 한 번에 넘긴다", () => {
    const store = makeStore(["a", "c"]);
    runCanvasMenuAction(store, "delete");
    expect(store.deleted).toEqual([["a", "c"]]);
  });

  it("순서는 부모의 setElementZIndex를 부른다", () => {
    const store = makeStore(["a"]);
    runCanvasMenuAction(store, "front");
    expect(store.zCalls).toEqual([["a", 2]]);
  });

  it("여럿 선택 시 순서는 아무 것도 안 한다", () => {
    const store = makeStore(["a", "b"]);
    runCanvasMenuAction(store, "forward");
    expect(store.zCalls).toEqual([]);
  });

  it("그룹·해제는 최상위 id만 넘긴다", () => {
    const grouping = makeStore(["a", "b"]);
    runCanvasMenuAction(grouping, "group");
    expect(grouping.grouped).toEqual([["a", "b"]]);

    const ungrouping = makeStore(["a"], { types: { a: "group" } });
    runCanvasMenuAction(ungrouping, "ungroup");
    expect(ungrouping.ungrouped).toEqual([["a"]]);
  });

  it("선택이 없으면 아무 것도 안 한다", () => {
    const store = makeStore([]);
    runCanvasMenuAction(store, "delete");
    expect(store.deleted).toEqual([]);
  });
});

describe("서식 복사·붙이기", () => {
  it("복사한 게 없으면 붙이기가 죽어 있다", () => {
    expect(item(makeStore(["a"]), "pasteFormat")?.disabled).toBe(true);
  });

  it("여럿 고르면 복사는 죽고 붙이기는 산다", () => {
    // 서식은 하나에서 떠서 여럿에 먹인다.
    const store = makeStore(["a", "b"]);
    expect(item(store, "copyFormat")?.disabled).toBe(true);
    runCanvasMenuAction(makeStore(["a"]), "copyFormat");
    expect(item(store, "pasteFormat")?.disabled).toBe(false);
  });

  it("그룹은 복사가 죽는다", () => {
    const store = makeStore(["a"], { types: { a: "group" } });
    expect(item(store, "copyFormat")?.disabled).toBe(true);
  });

  it("복사하면 클립보드에 담기고, 붙이면 선택 전부에 먹는다", () => {
    const source = makeStore(["a"]);
    source.els.a.type = "text";
    (source.els.a as Record<string, unknown>).fontSize = 44;
    runCanvasMenuAction(source, "copyFormat");
    expect(heldFormat()?.props).toMatchObject({ fontSize: 44 });

    const targets = makeStore(["b", "c"]);
    runCanvasMenuAction(targets, "pasteFormat");
    expect(targets.els.b.set).toHaveBeenCalledWith(
      expect.objectContaining({ fontSize: 44 }),
    );
    expect(targets.els.c.set).toHaveBeenCalled();
    // ⌘Z 한 번에 전부 돌아가게 묶는다.
    expect(targets.history?.startTransaction).toHaveBeenCalledTimes(1);
  });

  it("잠긴 요소에는 붙이기가 죽는다", () => {
    runCanvasMenuAction(makeStore(["a"]), "copyFormat");
    expect(item(makeStore(["b"], { locked: ["b"] }), "pasteFormat")?.disabled).toBe(true);
  });
});
