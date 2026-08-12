import Konva from "konva";

/**
 * Client-space geometry for a Canvas element, read from the Konva node it
 * actually renders as (so zoom, scroll and the stacked workspace's per-page slots
 * are all baked in — nothing here re-derives layout math).
 *
 * A GROUP is measured from its children, not from a node lookup: Canvas does not
 * reliably stamp the element id onto the Konva.Group it creates, so `#<groupId>`
 * resolves to nothing. Unioning the leaf rects gives the same box and works either
 * way.
 */

export type ClientRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type RectElement = {
  id: string;
  type?: string;
  children?: RectElement[];
};

/** The rect of ONE element's own Konva node, in client (viewport) coordinates. */
export function konvaClientRect(id: string): ClientRect | null {
  for (const stage of Konva.stages) {
    const node = stage.findOne(`#${id}`);
    if (!node) continue;
    const box = node.getClientRect(); // stage px, zoom included
    if (!box.width || !box.height) return null;
    const s = stage.container().getBoundingClientRect();
    return {
      left: s.left + box.x,
      top: s.top + box.y,
      right: s.left + box.x + box.width,
      bottom: s.top + box.y + box.height,
    };
  }
  return null;
}

export function unionRect(rects: ReadonlyArray<ClientRect | null>): ClientRect | null {
  let out: ClientRect | null = null;
  for (const r of rects) {
    if (!r) continue;
    out = out
      ? {
          left: Math.min(out.left, r.left),
          top: Math.min(out.top, r.top),
          right: Math.max(out.right, r.right),
          bottom: Math.max(out.bottom, r.bottom),
        }
      : r;
  }
  return out;
}

/** Every leaf under `el` — the elements that really have a Konva node. */
export function leafIds(el: RectElement): string[] {
  const kids = el.children;
  if (!kids?.length) return [el.id];
  return kids.flatMap(leafIds);
}

/** The box of any element, group or not, in client coordinates. */
export function elementClientRect(
  el: RectElement,
  rectOf: (id: string) => ClientRect | null = konvaClientRect,
): ClientRect | null {
  return unionRect(leafIds(el).map(rectOf));
}

export function pointInRect(
  r: ClientRect | null,
  p: { x: number; y: number },
): boolean {
  if (!r) return false;
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}
