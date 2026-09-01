"use client";

/**
 * 판을 다른 벌로 끌 때 잡는 자리.
 *
 * **판 상자 안에** 산다. 예전에는 마우스 자리를 재어 판 위에 띄웠는데, 손잡이가 판
 * 모서리에 있다 보니 바깥에서 다가가는 손은 «판 밖»을 지나 온다 — 그때마다 사라져서
 * 잡으러 가는 내내 깜빡였다. 크기를 키워도 그대로였다. 안에 있으면 잴 것이 없고
 * 깜빡일 일도 없다.
 *
 * 늘 있지만 옅다. 마우스가 그 판에 올라오면 진해진다 — CSS 가 정하는 일이라
 * 리액트가 끼어들 자리가 없다.
 */

import { GripVertical } from "lucide-react";

import { startFrameDrag } from "./frame-drag-bus";

export function FrameDragGrip({ pageId }: { pageId: string }) {
  return (
    <button
      type="button"
      data-dp-frame-grip=""
      title="다른 벌로 끌어오기"
      aria-label="이 판을 다른 벌로 끌어오기"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        startFrameDrag(pageId, event);
      }}
      style={{ position: "absolute", left: 5, top: 5, width: 20, height: 20, zIndex: 6 }}
      className="flex cursor-grab items-center justify-center rounded border border-dpe-ink-200 bg-dpe-surface/90 text-dpe-ink-400 opacity-30 shadow-sm transition-opacity hover:opacity-100 focus-visible:opacity-100"
    >
      <GripVertical aria-hidden="true" size={12} />
    </button>
  );
}
