import { createRef } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// 히트테스트는 Konva 스테이지를 읽는다 — jsdom엔 없으므로 사각형을 우리가 준다.
const rects: Record<string, { left: number; top: number; right: number; bottom: number }> = {
  leaf: { left: 100, top: 100, right: 200, bottom: 200 },
  solo: { left: 300, top: 100, right: 400, bottom: 200 },
};
vi.mock("../element-rects", () => ({
  konvaClientRect: (id: string) => rects[id] ?? null,
  pointInRect: (
    r: { left: number; top: number; right: number; bottom: number } | null,
    p: { x: number; y: number },
  ) => !!r && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom,
}));

import {
  CanvasContextMenu,
  contextTarget,
  menuPosition,
} from "../canvas-context-menu";

const rectOf = (id: string) => rects[id] ?? null;
const PAGES = [
  {
    id: "p",
    children: [
      { id: "grp", type: "group", children: [{ id: "leaf", type: "text" }] },
      { id: "solo", type: "text" },
    ],
  },
];

describe("contextTarget", () => {
  it("커서 아래 최상위 요소를 고른다", () => {
    // 스톡 편집기의 좌클릭과 같은 규칙 — 잎을 맞혔어도 그룹이 선택된다.
    expect(contextTarget(PAGES, rectOf, { x: 150, y: 150 }, [])).toEqual({
      hit: true,
      select: "grp",
    });
  });

  it("이미 그 안쪽이 선택돼 있으면 선택을 안 건드린다", () => {
    // 드릴인해서 그룹 안 도형을 골라 놓고 우클릭했는데 그룹으로 되돌아가면
    // 메뉴가 사용자가 겨눈 것과 다른 걸 만진다.
    expect(contextTarget(PAGES, rectOf, { x: 150, y: 150 }, ["leaf"])).toEqual({
      hit: true,
      select: null,
    });
  });

  it("다른 요소가 선택돼 있으면 겨눈 것으로 바꾼다", () => {
    expect(contextTarget(PAGES, rectOf, { x: 350, y: 150 }, ["leaf"])).toEqual({
      hit: true,
      select: "solo",
    });
  });

  it("빈 캔버스는 hit=false", () => {
    expect(contextTarget(PAGES, rectOf, { x: 900, y: 900 }, [])).toEqual({
      hit: false,
      select: null,
    });
  });
});

describe("menuPosition", () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 200, height: 240 };

  it("보통은 커서 자리", () => {
    expect(menuPosition({ x: 300, y: 200 }, viewport, size)).toEqual({
      left: 300,
      top: 200,
    });
  });

  it("오른쪽·아래로 넘치면 안쪽으로 당긴다", () => {
    expect(menuPosition({ x: 980, y: 790 }, viewport, size)).toEqual({
      left: 792,
      top: 552,
    });
  });

  it("메뉴가 화면보다 크면 왼쪽 위에 붙인다", () => {
    expect(
      menuPosition({ x: 10, y: 10 }, { width: 100, height: 100 }, size),
    ).toEqual({ left: 8, top: 8 });
  });
});

function mount(selected: string[]) {
  const zCalls: unknown[][] = [];
  const parent = {
    children: [{ id: "grp" }, { id: "solo" }],
    setElementZIndex: (...a: unknown[]) => zCalls.push(a),
  };
  const els: Record<string, Record<string, unknown>> = {
    grp: { id: "grp", type: "group", parent, set: vi.fn(), clone: vi.fn() },
    solo: { id: "solo", type: "text", parent, set: vi.fn(), clone: vi.fn() },
  };
  const selectElements = vi.fn();
  const deleteElements = vi.fn();
  const store = {
    pages: PAGES,
    selectedElementsIds: selected,
    selectedElements: selected.map((id) => els[id]),
    selectElements,
    deleteElements,
    history: { startTransaction: vi.fn(), endTransaction: vi.fn() },
  };
  const ref = createRef<HTMLDivElement>();
  const view = render(
    <div ref={ref}>
      <CanvasContextMenu store={store} containerRef={ref} />
    </div>,
  );
  return { view, ref, store, selectElements, deleteElements, zCalls, els };
}

/** 컨테이너에 우클릭을 던진다. */
function rightClick(ref: { current: HTMLDivElement | null }, x: number, y: number) {
  act(() => {
    fireEvent.contextMenu(ref.current!, { clientX: x, clientY: y });
  });
}

describe("CanvasContextMenu", () => {
  it("처음에는 아무 것도 안 그린다", () => {
    mount(["solo"]);
    expect(document.querySelector("[data-dp-canvas-menu]")).toBeNull();
  });

  it("요소 위에서 우클릭하면 메뉴가 뜬다", () => {
    const { ref } = mount(["solo"]);
    rightClick(ref, 350, 150);
    const menu = document.querySelector("[data-dp-canvas-menu]");
    expect(menu).not.toBeNull();
    expect(
      [...menu!.querySelectorAll("[data-dp-menu-action]")].map(
        (b) => (b as HTMLElement).dataset.dpMenuAction,
      ),
    ).toEqual([
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

  it("빈 곳 우클릭은 브라우저 기본 메뉴에 맡긴다", () => {
    const { ref } = mount(["solo"]);
    rightClick(ref, 900, 900);
    expect(document.querySelector("[data-dp-canvas-menu]")).toBeNull();
  });

  it("선택 안 된 요소를 우클릭하면 먼저 고른다", () => {
    const { ref, selectElements } = mount(["solo"]);
    rightClick(ref, 150, 150);
    expect(selectElements).toHaveBeenCalledWith(["grp"]);
  });

  it("항목을 누르면 동작하고 닫힌다", () => {
    const { ref, deleteElements } = mount(["solo"]);
    rightClick(ref, 350, 150);
    act(() => {
      fireEvent.click(
        document.querySelector('[data-dp-menu-action="delete"]')!,
      );
    });
    expect(deleteElements).toHaveBeenCalledWith(["solo"]);
    expect(document.querySelector("[data-dp-canvas-menu]")).toBeNull();
  });

  it("Esc로 닫힌다", () => {
    const { ref } = mount(["solo"]);
    rightClick(ref, 350, 150);
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(document.querySelector("[data-dp-canvas-menu]")).toBeNull();
  });

  it("바깥을 누르면 닫힌다", () => {
    const { ref } = mount(["solo"]);
    rightClick(ref, 350, 150);
    act(() => {
      fireEvent.pointerDown(document.querySelector("[data-dp-menu-backdrop]")!);
    });
    expect(document.querySelector("[data-dp-canvas-menu]")).toBeNull();
  });

  it("그룹을 우클릭하면 그룹 해제가 있다", () => {
    const { ref } = mount(["grp"]);
    rightClick(ref, 150, 150);
    expect(
      document.querySelector('[data-dp-menu-action="ungroup"]'),
    ).not.toBeNull();
  });
});
