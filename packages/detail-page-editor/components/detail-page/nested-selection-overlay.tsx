"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { observer } from "./canvas-observer";

import {
  selectedElementsDeep,
  type SelectableElement,
} from "./detail-page-selection";
import {
  elementClientRect,
  type RectElement,
} from "./element-rects";

/**
 * Real selection — move + resize — for a GROUP CHILD.
 *
 * the stock editor's selection model only ever holds TOP-LEVEL element ids: its canvas
 * resolves any hit node to ``el.top`` (the outermost non-group ancestor) before
 * selecting, and ``store.selectedShapes`` (what the Konva Transformer attaches
 * to) derives from ``store.selectedElements``, a getter that only scans a page's
 * direct children. So a group child gets no transformer, and the moment you press
 * on it the canvas re-selects its group instead — you cannot drag it.
 *
 * Rather than fight that model, this overlay OWNS the interaction. It sits above
 * the canvas in the DOM, so a pointerdown on the selected child is consumed here
 * and never reaches Konva — the group can no longer steal the selection. Drag and
 * corner-resize write straight to the element (``el.set``), which is exactly what
 * the stock editor's own transformer would do, so undo/redo and re-render behave normally.
 *
 * Geometry comes from the Konva node itself (``getClientRect`` → absolute canvas
 * px, zoom included) mapped through the stage's container rect, so the overlay is
 * layout-independent: zoom, scroll, and the stacked workspace's per-page slots all
 * work without re-deriving any of their math. Screen deltas convert to element
 * deltas by dividing by ``store.scale``.
 */

type StoreLike = {
  selectedElements?: SelectableElement[];
  selectedElementsIds?: string[];
  getElementById?: (id: string) => SelectableElement | undefined;
  scale?: number;
  history?: { startTransaction?: () => void; endTransaction?: () => void };
};

type Rect = { left: number; top: number; width: number; height: number };
type Box = { id: string; rect: Rect; isGroup: boolean };
type Corner = "nw" | "ne" | "sw" | "se";

/** The selected ids Canvas itself cannot draw — i.e. the ones nested in a group. */
export function nestedSelectedIds(store: StoreLike): string[] {
  const deep = selectedElementsDeep(store);
  if (!deep.length) return [];
  // ``selectedElements`` only ever holds TOP-LEVEL elements; anything resolved
  // deep but absent there is nested, and therefore has no Canvas transformer.
  const topLevel = new Set((store.selectedElements ?? []).map((e) => e.id));
  return deep.map((e) => e.id).filter((id) => !topLevel.has(id));
}

/**
 * Measure a selected element and return its rect in `container` space.
 *
 * Goes through ``elementClientRect``, which measures a GROUP from its children:
 * Canvas never stamps the element id onto the Konva.Group it renders, so a direct
 * `#<groupId>` lookup finds nothing — a group nested inside another group would get
 * no selection box at all.
 */
function measure(el: SelectableElement, container: HTMLElement): Rect | null {
  const r = elementClientRect(el as RectElement);
  if (!r) return null;
  const host = container.getBoundingClientRect();
  return {
    left: r.left - host.left,
    top: r.top - host.top,
    width: r.right - r.left,
    height: r.bottom - r.top,
  };
}

const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const HANDLE = 8;
const ACCENT = "rgb(0, 161, 255)";
const MIN_SIZE = 4;

const CURSOR: Record<Corner, string> = {
  nw: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  se: "nwse-resize",
};

export type Geom = { x: number; y: number; width: number; height: number };

/**
 * Element geometry after dragging by (dx, dy) *element* px. ``corner === null``
 * moves; a corner resizes, anchoring the opposite corner (so a west/north grab
 * shifts x/y as the size changes). Sizes clamp so a box never inverts.
 */
export function applyDrag(
  start: Geom,
  corner: Corner | null,
  dx: number,
  dy: number,
): Geom {
  if (!corner) {
    return { ...start, x: Math.round(start.x + dx), y: Math.round(start.y + dy) };
  }
  const west = corner === "nw" || corner === "sw";
  const north = corner === "nw" || corner === "ne";
  const width = Math.max(MIN_SIZE, west ? start.width - dx : start.width + dx);
  const height = Math.max(MIN_SIZE, north ? start.height - dy : start.height + dy);
  return {
    x: Math.round(west ? start.x + (start.width - width) : start.x),
    y: Math.round(north ? start.y + (start.height - height) : start.y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** One element the drag writes to, with the geometry it started from. */
type DragTarget = { el: SelectableElement; start: Geom };

type DragState = {
  pointerId: number;
  corner: Corner | null; // null = move
  startX: number;
  startY: number;
  targets: DragTarget[];
};

/**
 * The elements a drag actually has to write to.
 *
 * A GROUP is not a transform: the stock editor's group element carries no offset (setting
 * its x/y moves nothing — verified on the live store), the LEAVES hold the real
 * coordinates. So moving a group means moving every leaf under it by the delta.
 */
export function dragTargets(el: SelectableElement): DragTarget[] {
  const kids = (el as { children?: SelectableElement[] }).children;
  if (kids?.length) return kids.flatMap(dragTargets);
  return [
    {
      el,
      start: {
        x: num(el.x),
        y: num(el.y),
        width: num(el.width),
        height: num(el.height),
      },
    },
  ];
}

export const NestedSelectionOverlay = observer(function NestedSelectionOverlay({
  store,
  containerRef,
  scrollRef,
}: {
  store: unknown;
  containerRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const s = store as StoreLike;
  const ids = nestedSelectedIds(s);
  const key = ids.join(",");
  const scale = s.scale ?? 1;

  // Reading each element's geometry here (mobx) re-renders the observer — and
  // re-measures — as a drag/resize moves it. Read the LEAVES: a group's own x/y
  // never change (they are not where its geometry lives), so watching them would
  // leave the box frozen while the group is dragged.
  const geomKey = ids
    .map((id) => {
      const el = s.getElementById?.(id);
      if (!el) return "";
      return dragTargets(el)
        .map((t) => `${t.start.x},${t.start.y},${t.start.width},${t.start.height}`)
        .join(";");
    })
    .join("|");

  const [boxes, setBoxes] = useState<Box[]>([]);
  const frame = useRef<number | null>(null);
  const drag = useRef<DragState | null>(null);

  const remeasure = () => {
    const host = containerRef.current;
    if (!host || !ids.length) {
      setBoxes((prev) => (prev.length ? [] : prev));
      return;
    }
    const next: Box[] = [];
    for (const id of ids) {
      const el = s.getElementById?.(id);
      if (!el) continue;
      const rect = measure(el, host);
      // Each box carries its own id: a group whose children are all off-screen
      // measures to nothing, and an index-aligned array would then hand the next
      // box the wrong element to drag.
      if (rect) next.push({ id, rect, isGroup: el.type === "group" });
    }
    setBoxes(next);
  };

  // Measure after Konva has redrawn for this selection / zoom / geometry change.
  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      remeasure();
      requestAnimationFrame(remeasure);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scale, geomKey]);

  // Follow scroll / resize while a nested element stays selected.
  useEffect(() => {
    if (!key) return;
    const scroller = scrollRef.current;
    const onMove = () => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        remeasure();
      });
    };
    scroller?.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      scroller?.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scrollRef]);

  const begin = (
    e: ReactPointerEvent<HTMLElement>,
    id: string,
    corner: Corner | null,
  ) => {
    const el = s.getElementById?.(id);
    if (!el) return;
    // A locked layer must not move — same rule the Canvas transformer follows.
    if (el.draggable === false && !corner) return;
    // Consume the press so Konva never sees it: that is what stops the canvas
    // from resolving the hit to `el.top` and re-selecting the parent group.
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    s.history?.startTransaction?.();
    drag.current = {
      pointerId: e.pointerId,
      corner,
      startX: e.clientX,
      startY: e.clientY,
      targets: dragTargets(el),
    };
  };

  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.preventDefault();
    const k = scale || 1;
    // Screen px -> element px. Element coords are in the parent's space, so a
    // relative delta is correct whether or not the group carries an offset.
    const dx = (e.clientX - d.startX) / k;
    const dy = (e.clientY - d.startY) / k;

    for (const t of d.targets) {
      const next = applyDrag(t.start, d.corner, dx, dy);
      t.el.set(d.corner ? next : { x: next.x, y: next.y });
    }
  };

  const end = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    s.history?.endTransaction?.();
  };

  if (!boxes.length) return null;

  return (
    <div
      data-dp-nested-selection=""
      style={{
        position: "absolute",
        inset: 0,
        // Only the boxes themselves take pointer events; everywhere else the
        // canvas keeps its normal click behaviour.
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {boxes.map(({ id, rect: r, isGroup }) => (
        <div
          key={id}
          onPointerDown={(e) => begin(e, id, null)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          style={{
            position: "absolute",
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            border: `1px solid ${ACCENT}`,
            boxSizing: "border-box",
            pointerEvents: "auto",
            cursor: "move",
            touchAction: "none",
          }}
        >
          {/* A group is move-only. Its width/height are not a real box (the
              decomposer pins the wrapper to the origin and the children hold the
              coordinates), so a corner drag would resize nothing and mangle the
              geometry. Drag its children to resize. */}
          {isGroup
            ? null
            : (["nw", "ne", "sw", "se"] as const).map((corner) => (
                <span
                  key={corner}
                  onPointerDown={(e) => begin(e, id, corner)}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  style={{
                    position: "absolute",
                    left:
                      (corner === "ne" || corner === "se" ? r.width : 0) -
                      HANDLE / 2,
                    top:
                      (corner === "sw" || corner === "se" ? r.height : 0) -
                      HANDLE / 2,
                    width: HANDLE,
                    height: HANDLE,
                    background: "#fff",
                    border: `1px solid ${ACCENT}`,
                    boxSizing: "border-box",
                    pointerEvents: "auto",
                    cursor: CURSOR[corner],
                    touchAction: "none",
                  }}
                />
              ))}
        </div>
      ))}
    </div>
  );
});
NestedSelectionOverlay.displayName = "NestedSelectionOverlay";
