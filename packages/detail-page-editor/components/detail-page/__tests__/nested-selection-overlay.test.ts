import { describe, expect, it, vi } from "vitest";

import {
  applyDrag,
  dragTargets,
  nestedSelectedIds,
} from "../nested-selection-overlay";

/**
 * We only draw a selection box for elements the stock editor CANNOT draw one for: those
 * nested in a group. A top-level selection already gets the stock Konva
 * Transformer, so drawing our own would double up the outline.
 */
const el = (id: string) => ({ id, type: "text", set: vi.fn() });

describe("nestedSelectedIds", () => {
  it("returns a group child (resolved deep, absent from selectedElements)", () => {
    const child = el("c1");
    expect(
      nestedSelectedIds({
        selectedElements: [], // the stock editor's getter is blind to the nested id
        selectedElementsIds: ["c1"],
        getElementById: (id) => (id === "c1" ? child : undefined),
      }),
    ).toEqual(["c1"]);
  });

  it("ignores a top-level selection — Canvas already draws its transformer", () => {
    const top = el("t1");
    expect(
      nestedSelectedIds({
        selectedElements: [top],
        selectedElementsIds: ["t1"],
        getElementById: (id) => (id === "t1" ? top : undefined),
      }),
    ).toEqual([]);
  });

  it("returns nothing when nothing is selected", () => {
    expect(
      nestedSelectedIds({ selectedElements: [], selectedElementsIds: [] }),
    ).toEqual([]);
  });

  it("keeps only the nested ids in a mixed selection", () => {
    const top = el("t1");
    const child = el("c1");
    const byId: Record<string, ReturnType<typeof el>> = { t1: top, c1: child };
    expect(
      nestedSelectedIds({
        selectedElements: [top],
        selectedElementsIds: ["t1", "c1"],
        getElementById: (id) => byId[id],
      }),
    ).toEqual(["c1"]);
  });
});

/**
 * Drag/resize math. Screen deltas are already divided by the zoom before they
 * reach this, so it works in element px. A corner resize must anchor the OPPOSITE
 * corner — a north-west grab shrinks the box AND walks x/y down with it.
 */
describe("applyDrag", () => {
  const start = { x: 100, y: 200, width: 60, height: 40 };

  it("moves the element by the delta, leaving its size alone", () => {
    expect(applyDrag(start, null, 15, -25)).toEqual({
      x: 115,
      y: 175,
      width: 60,
      height: 40,
    });
  });

  it("resizes from the south-east corner without moving the origin", () => {
    expect(applyDrag(start, "se", 10, 5)).toEqual({
      x: 100,
      y: 200,
      width: 70,
      height: 45,
    });
  });

  it("resizes from the north-west corner, anchoring the south-east corner", () => {
    const r = applyDrag(start, "nw", 10, 5);
    expect(r).toEqual({ x: 110, y: 205, width: 50, height: 35 });
    // The far corner stayed put: x+width and y+height are unchanged.
    expect(r.x + r.width).toBe(start.x + start.width);
    expect(r.y + r.height).toBe(start.y + start.height);
  });

  it("anchors the correct edges for the mixed corners", () => {
    const ne = applyDrag(start, "ne", 10, 5);
    expect(ne).toEqual({ x: 100, y: 205, width: 70, height: 35 });
    const sw = applyDrag(start, "sw", 10, 5);
    expect(sw).toEqual({ x: 110, y: 200, width: 50, height: 45 });
  });

  it("clamps the size so a box can never invert past the anchor", () => {
    const r = applyDrag(start, "nw", 999, 999);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
  });
});

/**
 * A GROUP is not a transform in the stock editor: its element carries no offset (setting a
 * group's x/y moves nothing — verified against the live store), the LEAVES hold the
 * real coordinates. Dragging a group therefore has to write to every leaf under it.
 */
describe("dragTargets", () => {
  const leaf = (id: string, x: number, y: number) => ({
    id,
    type: "svg",
    x,
    y,
    width: 10,
    height: 20,
    set: vi.fn(),
  });

  it("returns the element itself for a leaf", () => {
    const el = leaf("a", 5, 6);
    expect(dragTargets(el)).toEqual([
      { el, start: { x: 5, y: 6, width: 10, height: 20 } },
    ]);
  });

  it("flattens a group to its leaves, ignoring the group's own (empty) geometry", () => {
    const a = leaf("a", 5, 6);
    const b = leaf("b", 50, 60);
    const group = { id: "g", type: "group", set: vi.fn(), children: [a, b] };
    const targets = dragTargets(group);
    expect(targets.map((t) => t.el.id)).toEqual(["a", "b"]);
    expect(targets[0].start).toEqual({ x: 5, y: 6, width: 10, height: 20 });
  });

  it("recurses through a group nested in a group", () => {
    const a = leaf("a", 1, 2);
    const inner = { id: "inner", type: "group", set: vi.fn(), children: [a] };
    const outer = { id: "outer", type: "group", set: vi.fn(), children: [inner] };
    expect(dragTargets(outer).map((t) => t.el.id)).toEqual(["a"]);
  });
});
