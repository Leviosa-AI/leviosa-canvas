import { describe, expect, it } from "vitest";

import {
  elementClientRect,
  leafIds,
  pointInRect,
  unionRect,
  type ClientRect,
  type RectElement,
} from "../element-rects";

/**
 * A group's box has to come from its CHILDREN. the stock editor does not stamp the element
 * id onto the Konva.Group it renders, so `stage.findOne("#" + groupId)` returns
 * nothing — anything that asked a group for its own rect got null and silently did
 * nothing (this is what broke the first cut of the canvas drill-in).
 */

const RECTS: Record<string, ClientRect> = {
  a: { left: 10, top: 20, right: 60, bottom: 40 },
  b: { left: 40, top: 10, right: 80, bottom: 90 },
};
const rectOf = (id: string): ClientRect | null => RECTS[id] ?? null;

const group: RectElement = {
  id: "g",
  type: "group",
  children: [{ id: "a" }, { id: "b" }],
};

describe("leafIds", () => {
  it("flattens a nested group down to the elements that own a Konva node", () => {
    const nested: RectElement = {
      id: "outer",
      children: [{ id: "a" }, { id: "inner", children: [{ id: "b" }] }],
    };
    expect(leafIds(nested)).toEqual(["a", "b"]);
    expect(leafIds({ id: "solo" })).toEqual(["solo"]);
  });
});

describe("unionRect", () => {
  it("spans every rect and ignores the ones that could not be measured", () => {
    expect(unionRect([RECTS.a, null, RECTS.b])).toEqual({
      left: 10,
      top: 10,
      right: 80,
      bottom: 90,
    });
    expect(unionRect([null, null])).toBeNull();
  });
});

describe("elementClientRect", () => {
  it("measures a GROUP from its children, not from its own (absent) node", () => {
    expect(elementClientRect(group, rectOf)).toEqual({
      left: 10,
      top: 10,
      right: 80,
      bottom: 90,
    });
  });

  it("measures a leaf directly", () => {
    expect(elementClientRect({ id: "a" }, rectOf)).toEqual(RECTS.a);
  });

  it("returns null when nothing in the element could be measured", () => {
    expect(elementClientRect({ id: "ghost" }, rectOf)).toBeNull();
  });
});

describe("pointInRect", () => {
  it("includes the edges and rejects anything outside", () => {
    expect(pointInRect(RECTS.a, { x: 10, y: 40 })).toBe(true);
    expect(pointInRect(RECTS.a, { x: 9, y: 30 })).toBe(false);
    expect(pointInRect(null, { x: 20, y: 30 })).toBe(false);
  });
});
