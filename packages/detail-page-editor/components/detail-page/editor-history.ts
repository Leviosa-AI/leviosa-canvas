/**
 * Undo / redo that does not blow the editor up.
 *
 * Undoing a structural change (ungroup, group, delete) while the SELECTION still
 * points at the elements that change crashes the stock editor outright:
 *
 *   [mobx-state-tree] assertion failed: the creation of the observable instance
 *   must be done on the initializing phase
 *   Should not already be working.            (React, right behind it)
 *
 * The undo re-parents / re-creates those MST nodes, and the selection-driven
 * observers (selectedShapes → the Konva transformer) read them mid-patch, forcing
 * a lazy MST instance to materialise inside the patch — which MST refuses. Verified
 * against the live store on the STOCK Canvas workspace, so this is not something
 * our overlays introduced: ungroup → undo crashes; ungroup → deselect → undo
 * restores the group cleanly.
 *
 * So: drop the selection, run the history step, then re-select whatever survived.
 */

export type HistoryStore = {
  selectedElementsIds?: string[];
  selectElements?: (ids: string[]) => void;
  getElementById?: (id: string) => unknown;
  history: { undo: () => void; redo: () => void };
};

function step(store: HistoryStore, run: () => void): void {
  const before = store.selectedElementsIds?.slice() ?? [];
  if (!before.length) {
    run();
    return;
  }
  store.selectElements?.([]);
  // Deselecting is not enough on its own: React has to actually re-render and let
  // Konva detach the transformer from the old nodes. Clearing the selection and
  // undoing in the SAME tick still crashes — the patch lands while the observers
  // are mid-flight. A macrotask hop puts the undo after React has committed.
  setTimeout(() => {
    run();
    // Re-select only what the history step left behind: an id that no longer
    // resolves would put the selection right back into the state it just escaped.
    const alive = store.getElementById
      ? before.filter((id) => store.getElementById?.(id))
      : [];
    if (alive.length) store.selectElements?.(alive);
  }, 0);
}

export function safeUndo(store: HistoryStore): void {
  step(store, () => store.history.undo());
}

export function safeRedo(store: HistoryStore): void {
  step(store, () => store.history.redo());
}
