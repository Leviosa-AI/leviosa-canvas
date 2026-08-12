import { describe, expect, it } from "vitest";

import { dropSpot, locate, moveLayer } from "../layer-move";

type Node = {
  id: string;
  type?: string;
  children?: Node[];
  toJSON?: () => Record<string, unknown>;
};

function group(id: string, children: Node[], extra: Record<string, unknown> = {}): Node {
  const node: Node = { id, type: "group", children, ...extra };
  node.toJSON = () => ({ id, type: "group", children: [], ...extra });
  return node;
}

function leaf(id: string, type = "text"): Node {
  return { id, type };
}

/**
 * 스톡 편집기의 계약을 그대로 흉내내는 store.
 *
 * - ungroupElements: 그룹의 자식을 **페이지 끝**으로 올리고 그룹을 지운다.
 * - groupElements(ids, attrs): 그 요소들을 빼내 새 그룹(attrs가 기본값을 덮는다)으로
 *   묶어 **페이지 끝**에 붙인다. 자식 순서는 넘긴 ids 순서.
 * - setElementZIndex: 빼서 그 자리에 끼운다.
 */
function makeStore(children: Node[]) {
  const selected: string[] = [];
  const setZ = (list: Node[]) => (id: string, index: number) => {
    const at = list.findIndex((c) => c.id === id);
    if (at < 0) return;
    const [node] = list.splice(at, 1);
    list.splice(index, 0, node);
  };
  const attach = (node: Node) => {
    if (node.type === "group" && Array.isArray(node.children)) {
      (node as Node & { setElementZIndex?: unknown }).setElementZIndex = setZ(
        node.children,
      );
      node.children.forEach(attach);
    }
  };
  children.forEach(attach);

  const page = {
    id: "p1",
    children,
    setElementZIndex: setZ(children),
  };

  return {
    activePage: page,
    selectedIds: selected,
    selectElements: (ids: string[]) => {
      selected.splice(0, selected.length, ...ids);
    },
    ungroupElements: (ids: string[]) => {
      for (const id of ids) {
        const at = children.findIndex((c) => c.id === id);
        if (at < 0) continue;
        const [g] = children.splice(at, 1);
        (g.children ?? []).forEach((child) => children.push(child));
      }
    },
    groupElements: (ids: string[], attrs: Record<string, unknown> = {}) => {
      const picked: Node[] = [];
      for (const id of ids) {
        const at = children.findIndex((c) => c.id === id);
        if (at >= 0) picked.push(children.splice(at, 1)[0]);
      }
      const made = group(String(attrs.id ?? "new-group"), picked, {});
      Object.assign(made, attrs, { children: picked, type: "group" });
      attach(made);
      children.push(made);
      return made;
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
    expect(ids(store.activePage.children)).toEqual(["g1"]);
  });

  it("중첩 그룹이 얽히면 손대지 않는다", () => {
    // ungroupElements는 자식을 페이지로 올려버려서 중첩 그룹에 쓰면 계층이 깨진다.
    const inner = group("g2", [leaf("c1"), leaf("c2")]);
    const outer = group("g1", [inner, leaf("c3")]);
    const store = makeStore([outer, leaf("z")]);

    expect(moveLayer(store, "c1", { parentId: null, index: 0 })).toBe(false);
    expect(ids(store.activePage.children)).toEqual(["g1", "z"]);
    expect(ids(find(store.activePage.children, "g2")?.children)).toEqual(["c1", "c2"]);
  });

  it("없는 요소는 false", () => {
    const store = makeStore([leaf("a")]);
    expect(moveLayer(store, "nope", { parentId: null, index: 0 })).toBe(false);
  });
});
