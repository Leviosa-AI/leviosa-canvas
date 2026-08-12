import { describe, expect, it, vi } from "vitest";

import {
  expandBox,
  leafElements,
  replaceWithGif,
  unionBox,
} from "../replace-with-gif";

function el(overrides: Record<string, unknown> = {}) {
  return { id: "e1", type: "text", x: 0, y: 0, width: 100, height: 40, ...overrides };
}

function makeStore(children: Array<Record<string, unknown>> = []) {
  const activePage = {
    id: "p1",
    children,
    computedWidth: 1000,
    computedHeight: 1400,
    addElement: vi.fn((opts: Record<string, unknown>) => ({ id: "new", ...opts })),
  };
  return {
    pages: [activePage],
    activePage,
    deleteElements: vi.fn(),
  };
}

/**
 * children 배열을 실제로 바꾸는 store. 스톡 편집기와 같은 순서 계약을 흉내낸다:
 * addElement는 맨 뒤(=맨 앞에 그려짐)에 붙고, setElementZIndex는 빼서 그 자리에 끼운다.
 */
function makeLiveStore(children: Array<Record<string, unknown>>) {
  let seq = 0;
  const setZ = (list: Array<Record<string, unknown>>) => (id: string, index: number) => {
    const at = list.findIndex((c) => c.id === id);
    if (at < 0) return;
    const [node] = list.splice(at, 1);
    list.splice(index, 0, node);
  };
  const activePage = {
    id: "p1",
    children,
    computedWidth: 1000,
    computedHeight: 1400,
    addElement: (opts: Record<string, unknown>) => {
      seq += 1;
      const added = { id: `gif${seq}`, ...opts };
      children.push(added);
      return added;
    },
    setElementZIndex: setZ(children),
  };
  return {
    pages: [activePage],
    activePage,
    selectElements: () => {},
    // 그룹 해체·재구성(재부모화에 쓰인다). 스톡 편집기와 같은 계약: 둘 다 페이지 끝으로.
    ungroupElements: (ids: string[]) => {
      for (const id of ids) {
        const at = children.findIndex((c) => c.id === id);
        if (at < 0) continue;
        const [g] = children.splice(at, 1);
        ((g.children as Array<Record<string, unknown>>) ?? []).forEach((child) =>
          children.push(child),
        );
      }
    },
    groupElements: (ids: string[], attrs: Record<string, unknown> = {}) => {
      const picked: Array<Record<string, unknown>> = [];
      for (const id of ids) {
        const at = children.findIndex((c) => c.id === id);
        if (at >= 0) picked.push(children.splice(at, 1)[0]);
      }
      const made: Record<string, unknown> = {
        ...attrs,
        type: "group",
        children: picked,
      };
      made.setElementZIndex = setZ(picked);
      children.push(made);
      return made;
    },
    // Canvas처럼 그룹 안쪽까지 훑어 지운다.
    deleteElements: (ids: string[]) => {
      const prune = (list: Array<Record<string, unknown>>) => {
        for (let i = list.length - 1; i >= 0; i -= 1) {
          const node = list[i] as { id?: string; children?: unknown };
          if (ids.includes(String(node.id))) {
            list.splice(i, 1);
            continue;
          }
          if (Array.isArray(node.children)) {
            prune(node.children as Array<Record<string, unknown>>);
          }
        }
      };
      prune(children);
    },
  };
}

const order = (store: { activePage: { children: Array<{ id?: string }> } }) =>
  store.activePage.children.map((c) => c.id);

describe("unionBox", () => {
  it("여러 요소를 감싸는 상자를 만든다", () => {
    expect(
      unionBox([
        el({ x: 100, y: 10, width: 200, height: 50 }),
        el({ id: "e2", x: 60, y: 90, width: 120, height: 30 }),
      ]),
    ).toEqual({ x: 60, y: 10, width: 240, height: 110 });
  });

  it("그룹은 자식에서 다시 잰다", () => {
    // 스톡 편집기의 group은 캔버스에서 offset을 주지 않아 자식이 페이지 좌표를 들고 있고,
    // 그룹 모델의 x/y/width/height는 실제 보이는 상자와 어긋날 수 있다.
    const group = {
      id: "g1",
      type: "group",
      x: 0,
      y: 0,
      width: 5,
      height: 5,
      children: [
        el({ id: "c1", x: 40, y: 20, width: 100, height: 30 }),
        el({ id: "c2", x: 40, y: 60, width: 160, height: 30 }),
      ],
    };
    expect(unionBox([group])).toEqual({ x: 40, y: 20, width: 160, height: 70 });
  });

  it("좌표가 없으면 null", () => {
    expect(unionBox([])).toBeNull();
  });
});

describe("leafElements", () => {
  it("중첩 그룹까지 펼친다", () => {
    const nested = {
      id: "g1",
      type: "group",
      children: [
        { id: "g2", type: "group", children: [el({ id: "a" })] },
        el({ id: "b" }),
      ],
    };
    expect(leafElements([nested]).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("자식 없는 그룹은 그 자체가 잎이다(빈 상자를 만들지 않는다)", () => {
    expect(leafElements([{ id: "g", type: "group", children: [] }])).toHaveLength(1);
  });
});

describe("expandBox", () => {
  it("사방으로 키운다", () => {
    expect(expandBox({ x: 10, y: 20, width: 100, height: 50 }, 5)).toEqual({
      x: 5,
      y: 15,
      width: 110,
      height: 60,
    });
  });

  it("음수 여백은 무시한다", () => {
    const box = { x: 10, y: 20, width: 100, height: 50 };
    expect(expandBox(box, -8)).toEqual(box);
  });
});

describe("replaceWithGif", () => {
  it("원본을 지우고 같은 자리·크기로 GIF를 넣는다", () => {
    const target = el({ x: 40, y: 120, width: 300, height: 200 });
    const store = makeStore([target]);

    replaceWithGif(store, [target], "https://s3/a.gif");

    expect(store.activePage.addElement).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "image",
        src: "https://s3/a.gif",
        x: 40,
        y: 120,
        width: 300,
        height: 200,
        name: "GIF",
        custom: { detailPageGif: true },
      }),
    );
    expect(store.deleteElements).toHaveBeenCalledWith(["e1"]);
  });

  it("여백을 주면 그만큼 키운 자리에 넣는다", () => {
    const target = el({ x: 100, y: 50, width: 200, height: 60 });
    const store = makeStore([target]);

    replaceWithGif(store, [target], "https://s3/a.gif", { bleed: 20 });

    expect(store.activePage.addElement).toHaveBeenCalledWith(
      expect.objectContaining({ x: 80, y: 30, width: 240, height: 100 }),
    );
  });

  it("회전과 자르기를 물려받는다", () => {
    const target = el({
      type: "image",
      rotation: 12,
      cropX: 0.1,
      cropY: 0.2,
      cropWidth: 0.7,
      cropHeight: 0.5,
    });
    const store = makeStore([target]);

    replaceWithGif(store, [target], "https://s3/a.gif", { inheritCrop: true });

    expect(store.activePage.addElement).toHaveBeenCalledWith(
      expect.objectContaining({
        rotation: 12,
        cropX: 0.1,
        cropHeight: 0.5,
      }),
    );
  });

  it("사진이 아니면 자르기를 물려주지 않는다", () => {
    const target = el({ type: "figure", cropX: 0.1 });
    const store = makeStore([target]);

    replaceWithGif(store, [target], "https://s3/a.gif", { inheritCrop: true });

    expect(store.activePage.addElement.mock.calls[0][0]).not.toHaveProperty(
      "cropX",
    );
  });

  it("여러 요소를 고르면 회전은 물려받지 않는다(무엇의 회전인지 모호하다)", () => {
    const a = el({ id: "a", rotation: 30 });
    const b = el({ id: "b", x: 200, rotation: 10 });
    const store = makeStore([a, b]);

    replaceWithGif(store, [a, b], "https://s3/a.gif");

    expect(store.activePage.addElement.mock.calls[0][0]).not.toHaveProperty(
      "rotation",
    );
    expect(store.deleteElements).toHaveBeenCalledWith(["a", "b"]);
  });

  it("src가 없으면 아무것도 지우지 않는다", () => {
    const target = el();
    const store = makeStore([target]);

    expect(replaceWithGif(store, [target], "")).toBeNull();
    expect(store.deleteElements).not.toHaveBeenCalled();
    expect(store.activePage.addElement).not.toHaveBeenCalled();
  });

  it("상자를 못 재면 원본을 건드리지 않는다", () => {
    const store = makeStore([]);
    expect(replaceWithGif(store, [], "https://s3/a.gif")).toBeNull();
    expect(store.deleteElements).not.toHaveBeenCalled();
  });
});

describe("replaceWithGif의 쌓임 순서", () => {
  it("원본이 있던 칸에 그대로 앉는다(맨 앞으로 튀지 않는다)", () => {
    const target = el({ id: "b" });
    const store = makeLiveStore([el({ id: "a" }), target, el({ id: "c" })]);

    replaceWithGif(store, [target], "https://s3/a.gif");

    expect(order(store)).toEqual(["a", "gif1", "c"]);
  });

  it("맨 뒤에 있던 원본은 맨 뒤에 남는다", () => {
    const target = el({ id: "a" });
    const store = makeLiveStore([target, el({ id: "b" }), el({ id: "c" })]);

    replaceWithGif(store, [target], "https://s3/a.gif");

    expect(order(store)).toEqual(["gif1", "b", "c"]);
  });

  it("페이지 직속 그룹을 통째로 대체하면 그룹이 있던 칸에 앉는다", () => {
    const group = {
      id: "g1",
      type: "group",
      children: [el({ id: "c1", x: 10, y: 10 }), el({ id: "c2", x: 10, y: 60 })],
    };
    const store = makeLiveStore([el({ id: "a" }), group, el({ id: "c" })]);

    replaceWithGif(store, [group], "https://s3/a.gif");

    expect(order(store)).toEqual(["a", "gif1", "c"]);
  });

  it("그룹 안의 자식을 대체하면 그 그룹 안 같은 칸에 들어간다", () => {
    const child = el({ id: "c2", x: 10, y: 10 });
    const group = {
      id: "g1",
      type: "group",
      children: [el({ id: "c1" }), child, el({ id: "c3" })],
    };
    const store = makeLiveStore([el({ id: "a" }), group, el({ id: "z" })]);

    replaceWithGif(store, [child], "https://s3/a.gif");

    // 그룹은 페이지 칸을 지키고, GIF는 원본이 있던 그룹 안 1번 칸에 앉는다.
    expect(order(store)).toEqual(["a", "g1", "z"]);
    const rebuilt = store.activePage.children.find((c) => c.id === "g1");
    expect((rebuilt?.children as Array<{ id: string }>).map((c) => c.id)).toEqual([
      "c1",
      "gif1",
      "c3",
    ]);
  });

  it("자식이 하나뿐인 그룹도 그대로 지킨다", () => {
    const child = el({ id: "c1", x: 10, y: 10 });
    const group = { id: "g1", type: "group", name: "말풍선", children: [child] };
    const store = makeLiveStore([el({ id: "a" }), group, el({ id: "z" })]);

    replaceWithGif(store, [child], "https://s3/a.gif");

    expect(order(store)).toEqual(["a", "g1", "z"]);
    const rebuilt = store.activePage.children.find((c) => c.id === "g1");
    expect((rebuilt?.children as Array<{ id: string }>).map((c) => c.id)).toEqual([
      "gif1",
    ]);
    expect(rebuilt?.name).toBe("말풍선");
  });

  it("여럿을 대체하면 그중 가장 앞에 있던 칸을 쓴다", () => {
    const a = el({ id: "a" });
    const c = el({ id: "c", x: 200 });
    const store = makeLiveStore([a, el({ id: "b" }), c, el({ id: "d" })]);

    replaceWithGif(store, [a, c], "https://s3/a.gif");

    expect(order(store)).toEqual(["b", "gif1", "d"]);
  });

  it("재정렬 API가 없어도 그대로 동작한다", () => {
    const target = el({ id: "b" });
    const store = makeLiveStore([el({ id: "a" }), target, el({ id: "c" })]);
    // 구버전/축소 store 흉내.
    (store.activePage as { setElementZIndex?: unknown }).setElementZIndex =
      undefined;

    expect(replaceWithGif(store, [target], "https://s3/a.gif")).not.toBeNull();
    expect(order(store)).toEqual(["a", "c", "gif1"]);
  });
});
