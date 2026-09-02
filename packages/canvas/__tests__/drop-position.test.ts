import { beforeEach, describe, expect, it } from "vitest";

import { CanvasStore } from "../store";
import { elementRect } from "../edit/rect";
import { dropOnOtherPage } from "../render/canvas-view";

/**
 * **놓은 자리가 놓은 그 자리인가.**
 *
 * 판의 DOM 상자를 손으로 세워 두면 브라우저 없이도 그 셈을 그대로 돌릴 수 있다.
 * 자리는 «끌던 노드가 그려져 있던 곳»으로 정한다 — 손끝에서 되짚지 않는다.
 */
const SCALE = 0.17;
const W = 1080;
const H = 1350;
/** 두 판이 화면에 놓인 자리(왼쪽 위, 화면 픽셀). */
const BOX = { a: { left: 100, top: 60 }, b: { left: 500, top: 400 } };

function stubPages() {
  document.body.innerHTML = "";
  for (const [id, at] of Object.entries(BOX)) {
    const node = document.createElement("div");
    node.setAttribute("data-lc-page", id);
    node.getBoundingClientRect = () =>
      ({
        left: at.left,
        top: at.top,
        right: at.left + W * SCALE,
        bottom: at.top + H * SCALE,
        width: W * SCALE,
        height: H * SCALE,
        x: at.left,
        y: at.top,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(node);
  }
  const hit = (x: number, y: number) =>
    [...document.querySelectorAll<HTMLElement>("[data-lc-page]")].filter((node) => {
      const r = node.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  document.elementsFromPoint = hit as unknown as typeof document.elementsFromPoint;
  document.elementFromPoint = ((x: number, y: number) =>
    hit(x, y)[0] ?? null) as typeof document.elementFromPoint;
}

function storeWith(child: Record<string, unknown>) {
  const store = new CanvasStore({
    pages: [
      { id: "a", width: W, height: H, children: [child] },
      { id: "b", width: W, height: H, children: [] },
    ],
  });
  store.setScale(SCALE);
  return store;
}

/** 화면 좌표 → 그 판 안의 문서 좌표. */
const at = (page: "a" | "b", docX: number, docY: number) => ({
  x: BOX[page].left + docX * SCALE,
  y: BOX[page].top + docY * SCALE,
});

describe("다른 벌에 놓기 — 놓은 자리", () => {
  beforeEach(stubPages);

  /**
   * b 판의 (docX, docY) 에 **보이는 네모의 왼쪽 위**가 오도록 하려면 끌던 노드가
   * 원래 판 좌표로 어디까지 가 있어야 하는가. `skew` 는 보이는 네모와 `x/y` 속성의 차.
   */
  const nodeFor = (docX: number, docY: number, skewX = 0, skewY = 0) => ({
    x: (BOX.b.left + docX * SCALE - BOX.a.left) / SCALE - skewX,
    y: (BOX.b.top + docY * SCALE - BOX.a.top) / SCALE - skewY,
  });

  it("그려져 있던 자리 그대로 앉는다", () => {
    const store = storeWith({ id: "e", type: "text", x: 200, y: 300, width: 400, height: 100 });

    expect(
      dropOnOtherPage(store, "e", at("b", 300, 300), nodeFor(300, 500), false),
    ).toBe(true);

    const moved = elementRect(store.pages[1].children[0]);
    expect(moved.x).toBeCloseTo(300, 6);
    expect(moved.y).toBeCloseTo(500, 6);
  });

  it("그룹은 `x/y` 속성이 아니라 보이는 네모가 기준이다", () => {
    // 그룹의 x 는 440 인데 보이는 네모는 470(=440+30) 에서 시작한다. 그 30 을 잃으면
    // 그만큼 밀려 앉는다 — 스크린샷에서 보인 어긋남이 이것이었다.
    const store = storeWith({
      id: "g",
      type: "group",
      x: 440,
      y: 172,
      children: [{ id: "g1", type: "text", x: 30, y: 10, width: 115, height: 54 }],
    });

    dropOnOtherPage(store, "g", at("b", 300, 300), nodeFor(300, 500, 30, 10), false);

    const moved = elementRect(store.pages[1].children[0]);
    expect(moved.x).toBeCloseTo(300, 6);
    expect(moved.y).toBeCloseTo(500, 6);
  });

  it("판 밖으로는 안 나간다", () => {
    const store = storeWith({ id: "e", type: "text", x: 0, y: 0, width: 100, height: 100 });
    dropOnOtherPage(store, "e", at("b", 10, 10), nodeFor(-800, -800), false);
    const moved = elementRect(store.pages[1].children[0]);
    expect(moved.x).toBe(0);
    expect(moved.y).toBe(0);
  });

  it("옮기면 원래 판에서 없어지고, ⌥ 면 남는다", () => {
    const move = storeWith({ id: "e", type: "text", x: 0, y: 0, width: 100, height: 100 });
    dropOnOtherPage(move, "e", at("b", 300, 300), nodeFor(300, 300), false);
    expect(move.pages[0].children).toHaveLength(0);
    expect(move.pages[1].children).toHaveLength(1);

    const copy = storeWith({ id: "e", type: "text", x: 0, y: 0, width: 100, height: 100 });
    dropOnOtherPage(copy, "e", at("b", 300, 300), nodeFor(300, 300), true);
    expect(copy.pages[0].children).toHaveLength(1);
    expect(copy.pages[1].children).toHaveLength(1);
  });
});
