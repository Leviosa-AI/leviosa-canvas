import { useSyncExternalStore } from "react";

/**
 * Which layer the pointer is over in the layers tree.
 *
 * The tree and the canvas live in different React subtrees (sidebar panel vs
 * workspace) with no common provider between them, and this is transient pointer
 * state that must never enter the Canvas document or its undo history — so it
 * lives in a tiny external store instead of the element model.
 */

let hovered: string | null = null;
const listeners = new Set<() => void>();

export function setHoveredLayerId(id: string | null): void {
  if (id === hovered) return;
  hovered = id;
  for (const l of listeners) l();
}

export function getHoveredLayerId(): string | null {
  return hovered;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useHoveredLayerId(): string | null {
  return useSyncExternalStore(subscribe, getHoveredLayerId, () => null);
}
