import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { safeRedo, safeUndo } from "../editor-history";

/**
 * Undoing a structural change with the selection still on the elements being
 * restored crashes the stock editor ("[mobx-state-tree] assertion failed: the creation of
 * the observable instance must be done on the initializing phase", then React's
 * "Should not already be working"). Verified on the STOCK workspace: ungroup → undo
 * throws; ungroup → deselect → undo restores cleanly. So every history step must
 * drop the selection first — and put back only what survived.
 *
 * Deselecting is not enough on its own, either: the undo has to land AFTER React has
 * re-rendered and Konva has detached the transformer, so the step hops a macrotask.
 */
function makeStore(opts: { selected: string[]; aliveAfter: string[] }) {
  const calls: string[] = [];
  const store = {
    selectedElementsIds: [...opts.selected],
    selectElements: vi.fn((ids: string[]) => {
      calls.push(`select(${ids.join(",") || "-"})`);
      store.selectedElementsIds = [...ids];
    }),
    getElementById: (id: string) =>
      opts.aliveAfter.includes(id) ? { id } : undefined,
    history: {
      undo: vi.fn(() => calls.push("undo")),
      redo: vi.fn(() => calls.push("redo")),
    },
  };
  return { store, calls };
}

describe("safeUndo / safeRedo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("clears the selection BEFORE the undo, then restores what survived", () => {
    const { store, calls } = makeStore({
      selected: ["g1", "g2"],
      aliveAfter: ["g1", "g2"],
    });
    safeUndo(store);
    expect(calls).toEqual(["select(-)"]); // the undo waits for React to commit
    vi.runAllTimers();
    expect(calls).toEqual(["select(-)", "undo", "select(g1,g2)"]);
  });

  it("drops ids the undo destroyed instead of re-selecting a dead node", () => {
    const { store, calls } = makeStore({
      selected: ["child-a", "child-b"], // the ungroup's orphans
      aliveAfter: [], // the undo folded them back into the group
    });
    safeUndo(store);
    vi.runAllTimers();
    expect(calls).toEqual(["select(-)", "undo"]);
    expect(store.selectedElementsIds).toEqual([]);
  });

  it("does not touch the selection when there was none", () => {
    const { store, calls } = makeStore({ selected: [], aliveAfter: [] });
    safeUndo(store);
    expect(calls).toEqual(["undo"]); // nothing to protect: no hop needed
    expect(store.selectElements).not.toHaveBeenCalled();
  });

  it("redo takes the same route", () => {
    const { store, calls } = makeStore({ selected: ["g1"], aliveAfter: ["g1"] });
    safeRedo(store);
    vi.runAllTimers();
    expect(calls).toEqual(["select(-)", "redo", "select(g1)"]);
  });
});
