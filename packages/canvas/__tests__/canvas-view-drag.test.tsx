// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
/**
 * 여럿을 골라 놓고 하나를 잡아 끌면 — 다 같이, 같은 만큼, ⌘Z 한 번에.
 *
 * Konva는 트랜스포머에 붙은 나머지 노드도 따라 끌며 노드마다 dragstart/dragmove/dragend를
 * 부른다. 그 순서를 손으로 흉내 내 작업 영역의 처리기를 그대로 돌린다.
 */
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("konva/lib/shapes/Ellipse", () => ({}));
vi.mock("konva/lib/shapes/Image", () => ({}));
vi.mock("konva/lib/shapes/Path", () => ({}));
vi.mock("konva/lib/shapes/Rect", () => ({}));
vi.mock("konva/lib/shapes/Text", () => ({}));
vi.mock("konva/lib/shapes/Line", () => ({}));
vi.mock("konva/lib/shapes/Transformer", () => ({}));

/** 요소 Group이 받은 처리기를 id로 모아 둔다. */
const groups = new Map<string, Record<string, unknown>>();

vi.mock("react-konva/es/ReactKonvaCore", () => {
  const node = (kind: string) => {
    const KonvaNode = (props: Record<string, unknown> & { children?: ReactNode }) => {
      if (kind === "group" && typeof props.id === "string") groups.set(props.id, props);
      return <div data-konva={kind}>{props.children}</div>;
    };
    KonvaNode.displayName = `Konva(${kind})`;
    return KonvaNode;
  };
  return {
    Stage: node("stage"),
    Layer: node("layer"),
    Line: node("line"),
    Transformer: node("transformer"),
    Group: node("group"),
    Rect: node("rect"),
    Text: node("text"),
    Image: node("image"),
    Ellipse: node("ellipse"),
    Path: node("path"),
    Shape: node("shape"),
  };
});

import {
  CanvasView,
  marqueeSelection,
  nextSelection,
  snapTargets,
} from "../render/canvas-view";
import { createCanvasStore } from "../store";

function setup() {
  groups.clear();
  const store = createCanvasStore({
    width: 1000,
    height: 1000,
    pages: [
      {
        id: "p",
        children: [
          { id: "a", type: "figure", x: 0, y: 0, width: 100, height: 100 },
          { id: "b", type: "figure", x: 200, y: 0, width: 100, height: 100 },
          { id: "c", type: "figure", x: 500, y: 500, width: 50, height: 50 },
        ],
      },
    ],
  });
  render(<CanvasView store={store} interactive />);
  store.selectElements(["a", "b"]);
  return store;
}

/** Konva 노드 흉내 — 자리와 옮겨진 자리만. */
function fakeNode(x: number, y: number) {
  const node = {
    at: { x, y },
    x: () => node.at.x,
    y: () => node.at.y,
    position: (pos: { x: number; y: number }) => {
      node.at = pos;
    },
    toDataURL: () => "",
  };
  return node;
}

function fire(id: string, name: string, target: ReturnType<typeof fakeNode>) {
  const handler = groups.get(id)?.[name] as ((e: unknown) => void) | undefined;
  expect(handler, `${id}.${name}`).toBeTypeOf("function");
  act(() => handler!({ target }));
}

describe("CanvasView — 여럿 끌기", () => {
  it("같은 만큼 옮기고 ⌘Z 한 번에 전부 돌아온다", () => {
    const store = setup();
    const a = fakeNode(0, 0);
    const b = fakeNode(200, 0);

    fire("a", "onDragStart", a);
    a.at = { x: 40, y: 30 };
    fire("a", "onDragMove", a);
    fire("b", "onDragStart", b);
    b.at = { x: 240, y: 30 };
    fire("b", "onDragMove", b);
    fire("a", "onDragEnd", a);
    fire("b", "onDragEnd", b);

    expect(store.getElementById("a")!.x).toBe(40);
    expect(store.getElementById("b")!.x).toBe(240);
    expect(store.selectedElementsIds).toEqual(["a", "b"]);

    act(() => store.history.undo());
    expect(store.getElementById("a")!.x).toBe(0);
    expect(store.getElementById("b")!.x).toBe(200);
  });

  it("스냅은 선택 합집합으로 재고, 함께 끌리는 것도 같은 만큼 민다", () => {
    const store = setup();
    const a = fakeNode(0, 0);
    const b = fakeNode(200, 0);

    // 합집합(3..303)의 왼쪽이 판 왼쪽 0에 붙는다 → -3.
    fire("a", "onDragStart", a);
    a.at = { x: 3, y: 200 };
    fire("a", "onDragMove", a);
    expect(a.at.x).toBe(0);
    fire("b", "onDragStart", b);
    b.at = { x: 203, y: 200 };
    fire("b", "onDragMove", b);
    expect(b.at.x).toBe(200);
    fire("a", "onDragEnd", a);
    fire("b", "onDragEnd", b);
    expect(store.getElementById("b")!.x).toBe(200);
  });
});

describe("선택 고치기", () => {
  it("이미 고른 것을 시프트 없이 누르면 선택을 그대로 둔다", () => {
    expect(nextSelection(["a", "b"], "b", false)).toEqual(["a", "b"]);
    expect(nextSelection(["a", "b"], "c", false)).toEqual(["c"]);
    expect(nextSelection(["a", "b"], "b", true)).toEqual(["a"]);
  });

  it("마퀴는 숨긴 것·잠긴 것을 안 잡고, 시프트면 선택에 더한다", () => {
    const store = createCanvasStore({
      width: 1000,
      height: 1000,
      pages: [
        {
          id: "p",
          children: [
            { id: "a", type: "figure", x: 0, y: 0, width: 10, height: 10 },
            { id: "hidden", type: "figure", x: 20, y: 0, width: 10, height: 10, visible: false },
            { id: "locked", type: "figure", x: 40, y: 0, width: 10, height: 10, locked: true },
            { id: "far", type: "figure", x: 900, y: 900, width: 10, height: 10 },
          ],
        },
      ],
    });
    const page = store.pages[0];
    const box = { x: -5, y: -5, width: 100, height: 30 };
    expect(marqueeSelection(store, page, null, box, false)).toEqual(["a"]);
    store.selectElements(["far"]);
    expect(marqueeSelection(store, page, null, box, true)).toEqual(["far", "a"]);
  });

  it("스냅 상대에서 함께 끌리는 것과 숨긴 것을 뺀다", () => {
    const store = createCanvasStore({
      width: 1000,
      height: 1000,
      pages: [
        {
          id: "p",
          children: [
            { id: "a", type: "figure", x: 0, y: 0, width: 10, height: 10 },
            { id: "b", type: "figure", x: 20, y: 0, width: 10, height: 10 },
            { id: "h", type: "figure", x: 40, y: 0, width: 10, height: 10, visible: false },
            { id: "t", type: "figure", x: 60, y: 0, width: 10, height: 10 },
          ],
        },
      ],
    });
    expect(snapTargets(store.pages[0].children, ["a", "b"])).toEqual([
      { x: 60, y: 0, width: 10, height: 10 },
    ]);
  });
});
