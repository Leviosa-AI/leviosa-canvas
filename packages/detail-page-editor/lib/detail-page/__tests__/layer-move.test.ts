// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { describe, expect, it, vi } from "vitest";

import { dropSpot, locate, moveLayer, whyNotMove } from "../layer-move";

type Node = {
  id: string;
  type?: string;
  x?: number;
  y?: number;
  children?: Node[];
  toJSON?: () => Record<string, unknown>;
};

function group(id: string, children: Node[], extra: Record<string, unknown> = {}): Node {
  const node: Node = { id, type: "group", children, ...extra };
  // 엔진처럼 자식까지 담아 준다 — 그룹을 옮겨도 속이 따라간다.
  node.toJSON = () => ({ ...node });
  return node;
}

function leaf(id: string, type = "text", extra: Partial<Node> = {}): Node {
  return { id, type, ...extra };
}

/**
 * 엔진 스토어의 계약을 그대로 흉내내는 store.
 *
 * - deleteElements: 트리 어디에 있든 지운다(빈 그룹은 남긴다).
 * - addElement(json, { index }): 페이지·그룹 둘 다 갖는다. json 의 id 를 그대로 쓴다.
 * - setElementZIndex: 빼서 그 자리에 끼운다.
 */
type Container = { children?: Node[] };
function makeStore(children: Node[]) {
  const selected: string[] = [];
  const setZ = (list: Node[]) => (id: string, index: number) => {
    const at = list.findIndex((c) => c.id === id);
    if (at < 0) return;
    const [node] = list.splice(at, 1);
    list.splice(index, 0, node);
  };
  const attach = (node: Node & Container) => {
    if (node.type === "group" && Array.isArray(node.children)) {
      const list = node.children;
      Object.assign(node, {
        setElementZIndex: setZ(list),
        addElement: (json: Node, options?: { index?: number }) => {
          attach(json);
          list.splice(options?.index ?? list.length, 0, json);
          return json;
        },
      });
      list.forEach(attach);
    }
  };
  children.forEach(attach);

  const page = {
    id: "p1",
    children,
    setElementZIndex: setZ(children),
    addElement: (json: Node, options?: { index?: number }) => {
      attach(json);
      children.splice(options?.index ?? children.length, 0, json);
      return json;
    },
  };
  const history = { startTransaction: vi.fn(), endTransaction: vi.fn() };

  return {
    activePage: page,
    selectedIds: selected,
    history,
    selectElements: (ids: string[]) => {
      selected.splice(0, selected.length, ...ids);
    },
    deleteElements: (ids: string[]) => {
      const prune = (list: Node[]) => {
        for (let i = list.length - 1; i >= 0; i -= 1) {
          if (ids.includes(list[i].id)) list.splice(i, 1);
          else if (list[i].children) prune(list[i].children!);
        }
      };
      prune(children);
    },
  };
}

const ids = (list: Node[] | undefined) => (list ?? []).map((c) => c.id);
const find = (list: Node[], id: string): Node | undefined => {
  for (const el of list) {
    if (el.id === id) return el;
    const hit = el.children ? find(el.children, id) : undefined;
    if (hit) return hit;
  }
  return undefined;
};

describe("locate", () => {
  it("페이지 직속이면 부모가 없다", () => {
    const page = { children: [leaf("a"), leaf("b")] };
    expect(locate(page, "b")).toEqual({ parent: null, index: 1 });
  });

  it("그룹 안이면 그 그룹과 인덱스를 준다", () => {
    const g = group("g1", [leaf("c1"), leaf("c2")]);
    const page = { children: [leaf("a"), g] };
    expect(locate(page, "c2")?.parent?.id).toBe("g1");
    expect(locate(page, "c2")?.index).toBe(1);
  });

  it("없으면 null", () => {
    expect(locate({ children: [leaf("a")] }, "zz")).toBeNull();
  });
});

describe("dropSpot", () => {
  // 목록은 앞(위) 요소가 맨 위로 오도록 뒤집어 그린다 → 화면상 "위"는 모델의 뒤 인덱스.
  const page = { children: [leaf("a"), leaf("b"), leaf("c")] };

  // 인덱스는 끌고 있는 요소를 뺀 목록 기준(setElementZIndex가 빼고 끼우는 계약).
  // a를 뺀 형제는 [b, c].
  it("행 위에 놓으면 그 행보다 앞", () => {
    // [b, c]의 1번 칸 = b 바로 앞.
    expect(dropSpot(page, "b", "before", "a")).toEqual({ parentId: null, index: 1 });
  });

  it("행 아래에 놓으면 그 행보다 뒤", () => {
    // [b, c]의 0번 칸 = b보다 뒤(맨 뒤).
    expect(dropSpot(page, "b", "after", "a")).toEqual({ parentId: null, index: 0 });
  });

  it("맨 위 행 위에 놓으면 맨 앞", () => {
    expect(dropSpot(page, "c", "before", "a")).toEqual({ parentId: null, index: 2 });
  });

  it("그룹 가운데에 놓으면 그 그룹 안 맨 앞", () => {
    const withGroup = { children: [group("g1", [leaf("c1"), leaf("c2")]), leaf("z")] };
    expect(dropSpot(withGroup, "g1", "inside", "z")).toEqual({
      parentId: "g1",
      index: 2,
    });
  });

  it("그룹이 아니면 안으로 못 넣는다", () => {
    expect(dropSpot(page, "b", "inside", "a")).toBeNull();
  });

  it("자기 행에는 못 놓는다", () => {
    expect(dropSpot(page, "b", "before", "b")).toBeNull();
  });
});

describe("moveLayer — 같은 부모", () => {
  it("페이지 안에서 순서를 바꾼다", () => {
    const store = makeStore([leaf("a"), leaf("b"), leaf("c")]);
    expect(moveLayer(store, "a", { parentId: null, index: 2 })).toBe(true);
    expect(ids(store.activePage.children)).toEqual(["b", "c", "a"]);
  });

  it("그룹 안에서 순서를 바꾼다(그룹은 그대로)", () => {
    const g = group("g1", [leaf("c1"), leaf("c2"), leaf("c3")]);
    const store = makeStore([leaf("a"), g]);

    expect(moveLayer(store, "c1", { parentId: "g1", index: 2 })).toBe(true);

    expect(ids(store.activePage.children)).toEqual(["a", "g1"]);
    expect(ids(find(store.activePage.children, "g1")?.children)).toEqual([
      "c2",
      "c3",
      "c1",
    ]);
  });
});

describe("moveLayer — 그룹 안으로", () => {
  it("페이지 요소를 그룹 안 원하는 칸에 넣는다", () => {
    const g = group("g1", [leaf("c1"), leaf("c2")], { name: "메달 배지" });
    const store = makeStore([leaf("a"), g, leaf("z")]);

    expect(moveLayer(store, "a", { parentId: "g1", index: 1 })).toBe(true);

    // 그룹은 id·이름을 지킨 채 원래 페이지 칸에 그대로 있다.
    expect(ids(store.activePage.children)).toEqual(["g1", "z"]);
    const rebuilt = find(store.activePage.children, "g1");
    expect(ids(rebuilt?.children)).toEqual(["c1", "a", "c2"]);
    expect((rebuilt as { name?: string }).name).toBe("메달 배지");
    expect(store.selectedIds).toEqual(["a"]);
  });

  it("그룹에서 다른 그룹으로 옮긴다", () => {
    const a = group("gA", [leaf("a1"), leaf("a2")]);
    const b = group("gB", [leaf("b1")]);
    const store = makeStore([a, leaf("mid"), b]);

    expect(moveLayer(store, "a2", { parentId: "gB", index: 0 })).toBe(true);

    expect(ids(store.activePage.children)).toEqual(["gA", "mid", "gB"]);
    expect(ids(find(store.activePage.children, "gA")?.children)).toEqual(["a1"]);
    expect(ids(find(store.activePage.children, "gB")?.children)).toEqual(["a2", "b1"]);
  });
});

describe("moveLayer — 그룹 밖으로", () => {
  it("그룹에서 빼내 페이지의 원하는 칸에 놓는다", () => {
    const g = group("g1", [leaf("c1"), leaf("c2")]);
    const store = makeStore([leaf("a"), g, leaf("z")]);

    expect(moveLayer(store, "c1", { parentId: null, index: 0 })).toBe(true);

    expect(ids(store.activePage.children)).toEqual(["c1", "a", "g1", "z"]);
    expect(ids(find(store.activePage.children, "g1")?.children)).toEqual(["c2"]);
  });

  it("마지막 자식이 나가면 빈 그룹은 사라진다", () => {
    const g = group("g1", [leaf("c1")]);
    const store = makeStore([leaf("a"), g]);

    expect(moveLayer(store, "c1", { parentId: null, index: 0 })).toBe(true);

    expect(ids(store.activePage.children)).toEqual(["c1", "a"]);
  });
});

describe("moveLayer — 거절", () => {
  it("자기 자손 안으로는 못 넣는다", () => {
    const inner = group("g2", [leaf("c1")]);
    const outer = group("g1", [inner]);
    const store = makeStore([outer]);

    expect(moveLayer(store, "g1", { parentId: "g2", index: 0 })).toBe(false);
    expect(whyNotMove(store, "g1", { parentId: "g2", index: 0 })).toBe("intoSelf");
    expect(ids(store.activePage.children)).toEqual(["g1"]);
  });

  it("그룹이 아닌 곳에는 못 넣고, 이유를 댄다", () => {
    const store = makeStore([leaf("a"), leaf("b")]);
    expect(whyNotMove(store, "a", { parentId: "b", index: 0 })).toBe("notGroup");
    expect(moveLayer(store, "a", { parentId: "b", index: 0 })).toBe(false);
    expect(whyNotMove(store, "nope", { parentId: null, index: 0 })).toBe("missing");
  });

  it("없는 요소는 false", () => {
    const store = makeStore([leaf("a")]);
    expect(moveLayer(store, "nope", { parentId: null, index: 0 })).toBe(false);
  });
});

describe("moveLayer — 중첩 그룹", () => {
  it("안쪽 그룹에서 페이지로 빼내도 계층이 안 무너진다", () => {
    const inner = group("g2", [leaf("c1"), leaf("c2")]);
    const outer = group("g1", [inner, leaf("c3")]);
    const store = makeStore([outer, leaf("z")]);

    expect(moveLayer(store, "c1", { parentId: null, index: 0 })).toBe(true);

    expect(ids(store.activePage.children)).toEqual(["c1", "g1", "z"]);
    expect(ids(find(store.activePage.children, "g1")?.children)).toEqual(["g2", "c3"]);
    expect(ids(find(store.activePage.children, "g2")?.children)).toEqual(["c2"]);
    // 떼기·붙이기가 undo 한 번으로 묶인다.
    expect(store.history.startTransaction).toHaveBeenCalledTimes(1);
    expect(store.history.endTransaction).toHaveBeenCalledTimes(1);
  });

  it("그룹 안 그룹으로 넣고, 화면 자리를 지키도록 원점 차이만큼 옮긴다", () => {
    // outer(100,50) 안의 inner(10,5) — inner 안 좌표계의 원점은 페이지 (110,55).
    const inner = group("g2", [leaf("c1")], { x: 10, y: 5 });
    const outer = group("g1", [inner, leaf("c3", "text", { x: 7, y: 7 })], {
      x: 100,
      y: 50,
    });
    const store = makeStore([outer]);

    expect(moveLayer(store, "c3", { parentId: "g2", index: 1 })).toBe(true);

    const moved = find(store.activePage.children, "c3");
    expect(ids(find(store.activePage.children, "g2")?.children)).toEqual(["c1", "c3"]);
    // 페이지 기준 (107,57) 그대로 — inner 기준으로는 (-3,2).
    expect({ x: moved?.x, y: moved?.y }).toEqual({ x: -3, y: 2 });
    expect(store.selectedIds).toEqual(["c3"]);
  });
});

describe("moveLayer — 실제 엔진", () => {
  it("중첩 그룹 밖으로 옮기고, undo 한 번에 돌아간다", async () => {
    const { createCanvasStore } = await import("@leviosa-ai/canvas/store");
    const store = createCanvasStore({
      width: 800,
      height: 600,
      pages: [
        {
          id: "p1",
          children: [
            {
              id: "g1",
              type: "group",
              x: 100,
              y: 0,
              children: [
                { id: "g2", type: "group", children: [{ id: "c1", type: "text", x: 5 }, { id: "c2", type: "text" }] },
              ],
            },
          ],
        },
      ],
    } as never);

    expect(moveLayer(store, "c1", { parentId: null, index: 1 })).toBe(true);
    expect(store.activePage?.children.map((el) => el.id)).toEqual(["g1", "c1"]);
    expect(store.getElementById("c1")?.x).toBe(105);
    expect(store.getElementById("g2")?.children.map((el) => el.id)).toEqual(["c2"]);

    store.history.undo();
    expect(store.getElementById("g2")?.children.map((el) => el.id)).toEqual(["c1", "c2"]);
  });
});
