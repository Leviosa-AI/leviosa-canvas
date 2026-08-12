/**
 * Selection resolver that can see INSIDE groups.
 *
 * the stock editor's ``store.selectedElements`` getter only scans each page's *direct*
 * children, so an id that belongs to a group child resolves to nothing — the
 * element reads as "not selected" even though ``store.selectElements([id])``
 * stored it. (The canvas reinforces this: a click resolves the hit node to
 * ``el.top``, the outermost non-group ancestor, so the stock editor's selection only ever
 * holds top-level ids.)
 *
 * ``store.getElementById`` is backed by ``_idsMap``, which IS built by walking
 * the whole tree, groups included. Resolving ``selectedElementsIds`` through it
 * therefore yields nested elements too — which is what lets the layers tree
 * select a group child and the properties inspector edit it.
 *
 * Both reads stay mobx-reactive, so ``observer`` components re-render on
 * selection change exactly as they did with the stock getter.
 */

export type SelectableElement = {
  id: string;
  type: string;
  set: (props: Record<string, unknown>) => void;
  [key: string]: unknown;
};

type SelectionStore = {
  selectedElementsIds?: string[];
  selectedElements?: SelectableElement[];
  getElementById?: (id: string) => SelectableElement | undefined;
};

export function selectedElementsDeep(store: SelectionStore): SelectableElement[] {
  const ids = store.selectedElementsIds ?? [];
  const byId = store.getElementById;
  if (ids.length && byId) {
    const resolved = ids
      .map((id) => byId(id))
      .filter((el): el is SelectableElement => !!el);
    if (resolved.length) return resolved;
  }
  // Older/foreign stores without _idsMap fall back to the stock getter.
  return store.selectedElements ?? [];
}
