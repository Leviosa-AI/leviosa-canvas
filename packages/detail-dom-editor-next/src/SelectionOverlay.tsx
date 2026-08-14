import type { CSSProperties } from "react";

export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function SelectionOverlay({ rect, zoom = 1 }: { rect: OverlayRect; zoom?: number }) {
  const style: CSSProperties = {
    position: "absolute",
    pointerEvents: "none",
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    border: `${1 / zoom}px solid #635bff`,
    boxSizing: "border-box",
    zIndex: 10000,
  };
  return <div data-dpnext-selection-overlay style={style} />;
}
