"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { observer } from "./canvas-observer";

import {
  elementClientRect,
  type RectElement,
} from "./element-rects";
import { useHoveredLayerId } from "./hovered-layer";

/**
 * Green outline on the canvas for the layer the pointer is over in the layers tree.
 *
 * The decomposed chart is a stack of a dozen rows all reading "도형" — the only way
 * to tell which is which is to see it light up. Deliberately GREEN and fill-tinted,
 * so it never reads as "selected" (blue box + handles); it is a preview, not a
 * state, and it takes no pointer events.
 */

const ACCENT = "rgb(16, 185, 129)";

type Store = { getElementById?: (id: string) => RectElement | undefined };

type Box = { left: number; top: number; width: number; height: number };

export const HoverHighlightOverlay = observer(function HoverHighlightOverlay({
  store,
  containerRef,
  scrollRef,
}: {
  store: unknown;
  containerRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const s = store as Store;
  const hoveredId = useHoveredLayerId();
  const [box, setBox] = useState<Box | null>(null);
  const frame = useRef<number | null>(null);

  const measure = () => {
    const host = containerRef.current;
    const el = hoveredId ? s.getElementById?.(hoveredId) : undefined;
    if (!host || !el) {
      setBox((prev) => (prev ? null : prev));
      return;
    }
    const r = elementClientRect(el);
    if (!r) {
      setBox(null);
      return;
    }
    const h = host.getBoundingClientRect();
    setBox({
      left: r.left - h.left,
      top: r.top - h.top,
      width: r.right - r.left,
      height: r.bottom - r.top,
    });
  };

  useLayoutEffect(() => {
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredId]);

  // Keep it pinned while the user scrolls the stack with the tree still hovered.
  useEffect(() => {
    if (!hoveredId) return;
    const scroller = scrollRef.current;
    const onMove = () => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        measure();
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
  }, [hoveredId, scrollRef]);

  if (!box) return null;

  return (
    <div
      data-dp-hover-highlight=""
      style={{
        position: "absolute",
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        border: `2px solid ${ACCENT}`,
        background: "rgba(16, 185, 129, 0.12)",
        boxSizing: "border-box",
        borderRadius: 2,
        pointerEvents: "none",
        zIndex: 19, // under the selection overlay (20), over the canvas
      }}
    />
  );
});
HoverHighlightOverlay.displayName = "HoverHighlightOverlay";
