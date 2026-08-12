"use client";

import { useEffect, useRef, type RefObject } from "react";

import {
  konvaClientRect,
  pointInRect,
  type ClientRect,
} from "./element-rects";

/**
 * Figma-style drill-in: click a group once to select the group, click again on a
 * shape inside it to select that shape.
 *
 * Canvas cannot do this on its own — its canvas resolves every hit node to
 * ``el.top`` (the outermost non-group ancestor), so a press inside a group always
 * re-selects the group and a group child is unreachable from the canvas. This
 * listener watches the gesture on the workspace container without ever blocking it:
 * when the group under the pointer already holds the selection, a click (press and
 * release in place) selects the shape under the cursor. A press that turns into a
 * DRAG is left alone — that is the user moving the whole group.
 *
 * Double-click falls out of the same rule for free — the first press selects the
 * group, and by the time the second press is captured the group IS selected, so it
 * drills in. No separate dblclick path, no timing heuristic.
 *
 * The hit test walks LEAVES, never a group's own box: the stock editor does not stamp the
 * element id onto the Konva.Group it renders, so asking for the group's rect gets
 * nothing and every drill silently no-ops. We find the front-most leaf under the
 * cursor and then look at what it belongs to.
 *
 * Once a child is selected, ``NestedSelectionOverlay`` draws its box and owns the
 * drag, so the shape genuinely moves and resizes.
 */

export type DrillElement = {
  id: string;
  type?: string;
  visible?: boolean;
  selectable?: boolean;
  locked?: boolean;
  children?: DrillElement[];
};

export type DrillPoint = { x: number; y: number };

type DrillStore = {
  pages?: Array<{ id: string; children?: DrillElement[] }>;
  selectedElementsIds?: string[];
  selectElements?: (ids: string[]) => void;
};

/** A hidden or locked layer is not a click target — the user put it out of reach. */
function isHittable(el: DrillElement): boolean {
  return el.visible !== false && el.selectable !== false && !el.locked;
}

/**
 * The path (top-level element → … → leaf) to the front-most leaf at `p`, searching
 * back to front because later children paint on top. Null when nothing is hit.
 */
export function frontmostPath(
  els: ReadonlyArray<DrillElement>,
  rectOf: (id: string) => ClientRect | null,
  p: DrillPoint,
): DrillElement[] | null {
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i];
    if (!isHittable(el)) continue;
    if (el.children?.length) {
      const inner = frontmostPath(el.children, rectOf, p);
      if (inner) return [el, ...inner];
      continue;
    }
    if (pointInRect(rectOf(el.id), p)) return [el];
  }
  return null;
}

/** Every id under `el`, itself included — used to ask "is the selection in here?". */
export function descendantIds(el: DrillElement, into = new Set<string>()): Set<string> {
  into.add(el.id);
  for (const c of el.children ?? []) descendantIds(c, into);
  return into;
}

/**
 * The id to select for a press at `p`, or null to let Canvas handle the press
 * normally (nothing to drill into, or this is the FIRST click on the group).
 */
export function drillTarget(
  children: ReadonlyArray<DrillElement>,
  rectOf: (id: string) => ClientRect | null,
  p: DrillPoint,
  selectedIds: ReadonlyArray<string>,
): string | null {
  const path = frontmostPath(children, rectOf, p);
  if (!path || path.length < 2) return null; // nothing hit, or not inside a group
  const top = path[0];
  const leaf = path[path.length - 1];
  // First click on an unselected group: Canvas selects the group, as it should.
  // Only once the selection is already inside this group do we drill deeper.
  const inside = descendantIds(top);
  if (!selectedIds.some((id) => inside.has(id))) return null;
  if (selectedIds.includes(leaf.id)) return null; // already there: let it drag
  return leaf.id;
}

/**
 * A press inside an already-selected group is ambiguous until the pointer comes back
 * up: released in place it is a CLICK (drill into the shape under the cursor);
 * dragged away it is a MOVE of the whole group, which is the stock editor's own transformer's
 * job. Acting at pointerdown broke the drag outright — the press never reached Konva,
 * so the group could not be dragged at all. So the press goes through untouched, and
 * the decision is taken at pointerup, once the intent is actually known.
 */
const DRAG_SLOP = 4; // px of travel before a press stops being a click

/** Has the pointer travelled far enough that this is a drag, not a click? */
export function exceedsDragSlop(from: DrillPoint, to: DrillPoint): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) > DRAG_SLOP;
}

/**
 * Canvas commits the selection on the mouseUP, not on the press (verified against
 * the live store: after pointerdown+mousedown alone `selectedElementsIds` is still
 * empty; it fills on mouseup). So a drill would be overwritten by the tail of its own
 * gesture — the mouseup resolves the hit to el.top and snaps the selection back to
 * the group.
 *
 * The obvious answer — swallow the tail — is WRONG, and it left the editor holding
 * the element after the user let go: Konva ends its drag on that same pointerup /
 * mouseup, so eating them strands it mid-drag (a ghost element following the cursor,
 * a marquee that never closes).
 *
 * So we never block anything. Konva and Canvas run the gesture end to end exactly as
 * they normally would, and the drill lands one macrotask later, overwriting the
 * selection Canvas just made. The cost is that the group is briefly selected before
 * the child is; the benefit is that no event Konva depends on ever goes missing.
 */
type Pending = { id: string; pointerId: number; x: number; y: number };

export function GroupDrillIn({
  store,
  containerRef,
}: {
  store: unknown;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const pending = useRef<Pending | null>(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const s = store as DrillStore;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onPointerDown = (e: PointerEvent) => {
      pending.current = null; // a new gesture: never carry a stale candidate
      if (e.button !== 0) return;
      // A modified click is the stock editor's multi-select (shift) — drilling would replace
      // the multi-selection with one child and break ⌘G on two groups.
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      // A press on OUR selection box belongs to the nested-selection overlay, which
      // owns that drag. (The shapes under a selected nested group are not themselves
      // selected, so the rule below would otherwise drill straight past it.)
      const target = e.target as Element | null;
      if (target?.closest?.("[data-dp-nested-selection]")) return;

      const p = { x: e.clientX, y: e.clientY };
      const selected = s.selectedElementsIds ?? [];
      for (const page of s.pages ?? []) {
        const id = drillTarget(page.children ?? [], konvaClientRect, p, selected);
        if (!id) continue;
        pending.current = { id, pointerId: e.pointerId, x: p.x, y: p.y };
        return;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointerId) return;
      if (exceedsDragSlop(p, { x: e.clientX, y: e.clientY })) {
        pending.current = null; // the user is dragging the group, not picking a child
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const p = pending.current;
      pending.current = null;
      if (!p || e.pointerId !== p.pointerId) return;
      // Released in place: a click. Let the gesture finish — Konva needs it — and
      // take the selection right after Canvas has made its own.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        s.selectElements?.([p.id]);
      }, 0);
    };

    const onCancel = () => {
      pending.current = null;
    };

    host.addEventListener("pointerdown", onPointerDown, { capture: true });
    host.addEventListener("pointermove", onPointerMove, { capture: true });
    host.addEventListener("pointerup", onPointerUp, { capture: true });
    host.addEventListener("pointercancel", onCancel, { capture: true });
    return () => {
      if (timer) clearTimeout(timer);
      host.removeEventListener("pointerdown", onPointerDown, { capture: true });
      host.removeEventListener("pointermove", onPointerMove, { capture: true });
      host.removeEventListener("pointerup", onPointerUp, { capture: true });
      host.removeEventListener("pointercancel", onCancel, { capture: true });
    };
  }, [store, containerRef]);

  return null;
}
