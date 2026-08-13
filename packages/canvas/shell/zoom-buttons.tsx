"use client";

/**
 * 배율 버튼 — 축소·현재 배율·확대.
 *
 * 배율은 문서가 아니라 보는 방식이라 스토어의 `scale`에 산다. 버튼이 자기 상태를 들면
 * 휠 확대(작업 영역이 한다)와 숫자가 어긋난다.
 */

import type { CSSProperties, ReactNode } from "react";

import type { CanvasStore } from "../store";
import { useCanvasVersion } from "../use-canvas";

const MIN = 0.05;
const MAX = 5;

const buttonStyle: CSSProperties = {
  width: 28,
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--lc-border, #e5e5e5)",
  borderRadius: "var(--lc-radius, 6px)",
  background: "var(--lc-surface, #ffffff)",
  color: "var(--lc-fg, #404040)",
  fontSize: 15,
  lineHeight: 1,
  cursor: "pointer",
};

export function ZoomButtons({
  store,
  step = 0.1,
  children,
}: {
  store: CanvasStore;
  /** 한 번 누를 때 바뀌는 양. */
  step?: number;
  /** 오른쪽에 덧붙일 것(맞춤 버튼 같은 것). */
  children?: ReactNode;
}) {
  useCanvasVersion(store);
  const set = (next: number) =>
    store.setScale(Math.max(MIN, Math.min(MAX, Number(next.toFixed(4)))));

  return (
    <div
      data-lc-zoom=""
      data-lc-part="zoom"
      style={{ display: "flex", alignItems: "center", gap: 6 }}
    >
      <button
        type="button"
        style={buttonStyle}
        aria-label="축소"
        onClick={() => set(store.scale - step)}
      >
        −
      </button>
      <span
        style={{
          minWidth: 46,
          textAlign: "center",
          fontSize: 12,
          color: "var(--lc-fg-muted, #525252)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {Math.round(store.scale * 100)}%
      </span>
      <button
        type="button"
        style={buttonStyle}
        aria-label="확대"
        onClick={() => set(store.scale + step)}
      >
        +
      </button>
      {children}
    </div>
  );
}
