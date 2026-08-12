import { describe, expect, it, vi } from "vitest";

import {
  canMoveZ,
  moveZ,
  setZ,
  zOrderOf,
  zTarget,
  type ZOrderElement,
} from "../z-order";

/** 형제 3개짜리 부모를 만들고, 그 중 `i`번째 요소를 돌려준다. */
function sibling(i: number, count = 3): ZOrderElement & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const children = Array.from({ length: count }, (_, k) => ({ id: `e${k}` }));
  const parent = {
    children,
    setElementZIndex: (...args: unknown[]) => calls.push(args),
  };
  return { id: `e${i}`, parent, calls };
}

describe("zOrderOf", () => {
  it("형제 배열에서 자리를 찾는다", () => {
    expect(zOrderOf(sibling(1))).toEqual({
      z: 1,
      count: 3,
      atFront: false,
      atBack: false,
    });
  });

  it("zIndex 게터가 있으면 그걸 믿는다", () => {
    // 스톡 편집기의 zIndex는 mobx 관찰 대상이라, 이걸 읽어야 순서가 바뀔 때 리렌더된다.
    const el = { ...sibling(0), zIndex: 2 };
    expect(zOrderOf(el)?.z).toBe(2);
    expect(zOrderOf(el)?.atFront).toBe(true);
  });

  it("형제가 하나뿐이면 null", () => {
    // 순서를 만질 수가 없다 — 컨트롤을 아예 안 그린다.
    expect(zOrderOf(sibling(0, 1))).toBeNull();
  });

  it("부모가 없거나 setElementZIndex가 없으면 null", () => {
    expect(zOrderOf({ id: "x" })).toBeNull();
    expect(zOrderOf({ id: "x", parent: { children: [{ id: "x" }, { id: "y" }] } })).toBeNull();
  });

  it("형제 배열에 자기가 없으면 null", () => {
    const el = sibling(1);
    expect(zOrderOf({ ...el, id: "없는놈" })).toBeNull();
  });
});

describe("zTarget", () => {
  const order = { z: 1, count: 3, atFront: false, atBack: false };

  it("한 칸씩 · 끝까지", () => {
    expect(zTarget(order, "forward")).toBe(2);
    expect(zTarget(order, "backward")).toBe(0);
    expect(zTarget(order, "front")).toBe(2);
    expect(zTarget(order, "back")).toBe(0);
  });

  it("범위 밖은 눌러 담는다", () => {
    expect(zTarget({ z: 2, count: 3, atFront: true, atBack: false }, "forward")).toBe(2);
    expect(zTarget({ z: 0, count: 3, atFront: false, atBack: true }, "backward")).toBe(0);
  });
});

describe("canMoveZ", () => {
  it("맨 앞에서는 앞으로 못 간다", () => {
    const front = { z: 2, count: 3, atFront: true, atBack: false };
    expect(canMoveZ(front, "forward")).toBe(false);
    expect(canMoveZ(front, "front")).toBe(false);
    expect(canMoveZ(front, "backward")).toBe(true);
  });

  it("순서가 없으면 전부 false", () => {
    expect(canMoveZ(null, "forward")).toBe(false);
  });
});

describe("moveZ", () => {
  it("부모의 setElementZIndex로 옮긴다", () => {
    // element.moveUp()은 그룹 안 요소에서 no-op이라 절대 쓰면 안 된다.
    const el = sibling(0);
    expect(moveZ(el, "front")).toBe(true);
    expect(el.calls).toEqual([["e0", 2]]);
  });

  it("갈 데가 없으면 아무 것도 안 부른다", () => {
    const el = sibling(2);
    expect(moveZ(el, "forward")).toBe(false);
    expect(el.calls).toEqual([]);
  });

  it("순서를 못 재는 요소는 조용히 무시", () => {
    const set = vi.fn();
    expect(moveZ({ id: "x", parent: { children: [{ id: "x" }], setElementZIndex: set } }, "front")).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });
});

describe("setZ", () => {
  it("범위 안으로 눌러 담는다", () => {
    const el = sibling(1);
    setZ(el, 99);
    setZ(el, -5);
    expect(el.calls).toEqual([
      ["e1", 2],
      ["e1", 0],
    ]);
  });
});
