import { useRef, type CSSProperties, type PointerEvent } from "react";

import { SelectionOverlay, type OverlayRect } from "./SelectionOverlay";

interface TransformOverlayProps {
  rect: OverlayRect;
  zoom?: number;
  onMove: (deltaX: number, deltaY: number) => void;
  onResize: (width: number, height: number) => void;
}

type DragMode = "move" | "resize";

interface DragState {
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  lastDeltaX: number;
  lastDeltaY: number;
}

export function TransformOverlay({ rect, zoom = 1, onMove, onResize }: TransformOverlayProps) {
  const drag = useRef<DragState | null>(null);
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const finish = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    const deltaX = current.lastDeltaX / scale;
    const deltaY = current.lastDeltaY / scale;
    if (current.mode === "move" && (deltaX || deltaY)) {
      onMove(deltaX, deltaY);
    } else if (current.mode === "resize" && (deltaX || deltaY)) {
      onResize(Math.max(1, rect.width + deltaX), Math.max(1, rect.height + deltaY));
    }
  };
  const start = (mode: DragMode) => (event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastDeltaX: 0,
      lastDeltaY: 0,
    };
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.lastDeltaX = event.clientX - current.startX;
    current.lastDeltaY = event.clientY - current.startY;
  };
  const frameStyle: CSSProperties = {
    position: "absolute",
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    zIndex: 10001,
    cursor: "move",
    touchAction: "none",
  };
  const handleStyle: CSSProperties = {
    position: "absolute",
    right: -5 / scale,
    bottom: -5 / scale,
    width: 10 / scale,
    height: 10 / scale,
    border: `${1 / scale}px solid #ffffff`,
    background: "#635bff",
    cursor: "nwse-resize",
  };
  return (
    <div data-dpnext-transform-overlay>
      <SelectionOverlay rect={rect} zoom={scale} />
      <div
        aria-label="선택 레이어 이동"
        role="button"
        tabIndex={0}
        style={frameStyle}
        onPointerDown={start("move")}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <span
          aria-label="선택 레이어 크기 조절"
          role="button"
          tabIndex={0}
          style={handleStyle}
          onPointerDown={start("resize")}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
        />
      </div>
    </div>
  );
}
