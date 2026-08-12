import { describe, expect, it } from "vitest";

import {
  descendantIds,
  drillTarget,
  exceedsDragSlop,
  frontmostPath,
  type DrillElement,
} from "../group-drill-in";
import type { ClientRect } from "../element-rects";

/**
 * Figma semantics: the FIRST click on a group selects the group (the stock editor's own
 * behaviour, which we must not steal), and the SECOND click — once the selection
 * is already inside that group — selects the shape under the cursor. Double-click
 * falls out of the same rule, because its first press is what selects the group.
 *
 * Critically the hit test walks LEAVES only. the stock editor does not stamp the element id
 * onto the Konva.Group it renders, so a hit test that asked for the group's own
 * rect got null back and every drill silently no-opped.
 */

// A chart group: a big axis part at the back, a green bar, and a label on top —
// their boxes overlap, exactly like the decomposed nia-chart.
const AXIS = "axis";
const BAR = "bar";
const LABEL = "label";
const GROUP = "chart";

const RECTS: Record<string, ClientRect> = {
  [AXIS]: { left: 100, top: 100, right: 500, bottom: 400 }, // spans the chart
  [BAR]: { left: 200, top: 250, right: 260, bottom: 400 },
  [LABEL]: { left: 190, top: 180, right: 300, bottom: 220 },
};
// The group id resolves to NOTHING, exactly as it does against a real Konva stage.
const rectOf = (id: string): ClientRect | null => RECTS[id] ?? null;

const chart = (): DrillElement => ({
  id: GROUP,
  type: "group",
  children: [
    { id: AXIS, type: "svg" },
    { id: BAR, type: "svg" },
    { id: LABEL, type: "text" },
  ],
});

const IN_BAR = { x: 230, y: 300 };
const IN_LABEL = { x: 240, y: 200 };
const EMPTY_IN_CHART = { x: 450, y: 130 }; // inside the group, only the axis box
const OUTSIDE = { x: 600, y: 600 };

describe("frontmostPath", () => {
  it("returns the front-most leaf when boxes overlap, not the back-most", () => {
    // The axis box also contains this point, but the bar paints on top of it.
    expect(frontmostPath([chart()], rectOf, IN_BAR)?.map((e) => e.id)).toEqual([
      GROUP,
      BAR,
    ]);
  });

  it("skips hidden and locked layers — the user put them out of reach", () => {
    const hidden: DrillElement = {
      id: GROUP,
      type: "group",
      children: [
        { id: AXIS, type: "svg" },
        { id: BAR, type: "svg", visible: false },
      ],
    };
    expect(frontmostPath([hidden], rectOf, IN_BAR)?.at(-1)?.id).toBe(AXIS);
    const locked: DrillElement = {
      id: GROUP,
      type: "group",
      children: [
        { id: AXIS, type: "svg" },
        { id: BAR, type: "svg", locked: true },
      ],
    };
    expect(frontmostPath([locked], rectOf, IN_BAR)?.at(-1)?.id).toBe(AXIS);
  });

  it("returns null when the point misses everything", () => {
    expect(frontmostPath([chart()], rectOf, OUTSIDE)).toBeNull();
  });
});

describe("descendantIds", () => {
  it("collects the group and everything under it", () => {
    expect([...descendantIds(chart())]).toEqual([GROUP, AXIS, BAR, LABEL]);
  });
});

describe("drillTarget", () => {
  const page = [chart()];

  it("does NOT drill on the first click — Canvas selects the group", () => {
    expect(drillTarget(page, rectOf, IN_BAR, [])).toBeNull();
    expect(drillTarget(page, rectOf, IN_BAR, ["something-else"])).toBeNull();
  });

  it("drills to the shape under the cursor once the group is selected", () => {
    expect(drillTarget(page, rectOf, IN_BAR, [GROUP])).toBe(BAR);
    expect(drillTarget(page, rectOf, IN_LABEL, [GROUP])).toBe(LABEL);
  });

  it("moves between siblings while the selection stays inside the group", () => {
    // A child is selected (not the group) — a press on another child hops to it.
    expect(drillTarget(page, rectOf, IN_LABEL, [BAR])).toBe(LABEL);
  });

  it("returns null for a press on the already-selected child, so it can drag", () => {
    expect(drillTarget(page, rectOf, IN_BAR, [BAR])).toBeNull();
  });

  it("falls back to the axis for a press on empty space inside the group", () => {
    expect(drillTarget(page, rectOf, EMPTY_IN_CHART, [GROUP])).toBe(AXIS);
  });

  it("leaves a press outside the group to Canvas", () => {
    expect(drillTarget(page, rectOf, OUTSIDE, [GROUP])).toBeNull();
  });

  it("leaves a press on a plain top-level element to Canvas", () => {
    const flat: DrillElement[] = [{ id: BAR, type: "svg" }];
    expect(drillTarget(flat, rectOf, IN_BAR, [BAR])).toBeNull();
  });
});

/**
 * A press inside an already-selected group is ambiguous until the pointer comes back
 * up. Released in place it is a CLICK (drill into the shape under it); dragged away
 * it is a MOVE of the whole group — which is the stock editor's transformer's job, and it
 * needs the press, so we must not touch that gesture. Acting at pointerdown broke
 * the group drag outright.
 */
describe("exceedsDragSlop", () => {
  const from = { x: 100, y: 100 };

  it("treats a press released in place (or a jittery one) as a click", () => {
    expect(exceedsDragSlop(from, { x: 100, y: 100 })).toBe(false);
    expect(exceedsDragSlop(from, { x: 102, y: 102 })).toBe(false); // hand tremor
  });

  it("treats real travel as a drag", () => {
    expect(exceedsDragSlop(from, { x: 110, y: 100 })).toBe(true);
    expect(exceedsDragSlop(from, { x: 100, y: 92 })).toBe(true);
  });
});
