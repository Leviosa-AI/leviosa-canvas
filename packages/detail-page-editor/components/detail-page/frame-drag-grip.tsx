"use client";

/**
 * 판을 다른 벌로 끌 때 잡는 자리.
 *
 * **판 상자 안에** 산다. 예전에는 마우스 자리를 재어 판 위에 띄웠는데, 손잡이가 판
 * 모서리에 있다 보니 바깥에서 다가가는 손은 «판 밖»을 지나 온다 — 그때마다 사라져서
 * 잡으러 가는 내내 깜빡였다. 크기를 키워도 그대로였다. 안에 있으면 잴 것이 없고
 * 깜빡일 일도 없다.
 *
 * **흐리게 두지 않는다.** 옅게 깔아 두면 «있는 줄 몰라서 못 잡는» 물건이 된다.
 * 20px 짜리라 늘 또렷해도 시끄럽지 않다.
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
      className="flex cursor-grab items-center justify-center rounded bg-le-surface/80 text-le-ink-800 transition-colors hover:bg-le-ink-900 hover:text-le-on-accent"
    >
      <GripVertical aria-hidden="true" size={13} />
    </button>
  );
}
