"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { observer } from "./canvas-observer";
import { useTranslation } from "react-i18next";
import { Wand2 } from "lucide-react";

import {
  isSectionReauthorWired,
  requestSectionReauthor,
  subscribeSectionReauthorAvailability,
} from "../../lib/detail-page/section-reauthor-bus";

/**
 * 활성 화면 옆에 뜨는 동그란 버튼 하나 — «이 화면 다시 만들기».
 *
 * 예전에는 세로 띠에 AI·위·아래·복제·추가·삭제가 줄줄이 붙어 있었다. 화면을 가리는
 * 데 비해 쓰는 것은 하나뿐이었고, 나머지 넷은 페이지를 다루는 일이라 페이지 목록과
 * 오른쪽 페이지 패널로 옮겼다.
 *
 * 붙박이가 아니라 끌어서 옮길 수 있다. 옮긴 자리는 편집기가 열려 있는 동안 유지된다
 * (화면을 바꿀 때마다 다시 붙는 위치로 튀면 옮긴 의미가 없다).
 */

type PageLike = { id: string };
type Offset = { x: number; y: number };

/** 이 편집기 세션 동안 기억한다 — 화면을 바꿔도 버튼이 제자리에 있게. */
let keptOffset: Offset = { x: 0, y: 0 };

/** 이만큼도 못 움직였으면 끈 것이 아니라 누른 것이다. */
const DRAG_SLOP = 4;

export const DetailPagePageToolbar = observer(function DetailPagePageToolbar({
  store,
  page,
}: {
  store: unknown;
  page: unknown;
}) {
  const { t } = useTranslation("branding");
  // 툴바가 편집기보다 먼저 그려질 수 있어 구독으로 읽는다(한 번 읽으면 계속 숨는다).
  const reauthorWired = useSyncExternalStore(
    subscribeSectionReauthorAvailability,
    isSectionReauthorWired,
    () => false,
  );
  const p = page as PageLike;
  const [offset, setOffset] = useState<Offset>(keptOffset);
  const drag = useRef<{ x: number; y: number; from: Offset } | null>(null);
  const dragged = useRef(false);

  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > DRAG_SLOP || Math.abs(dy) > DRAG_SLOP)
      dragged.current = true;
    if (!dragged.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // 화면 밖으로 던져 놓으면 다시 잡을 수가 없다 — 창 안으로 묶는다.
    const next = { x: start.from.x + dx, y: start.from.y + dy };
    const left = rect.left - offset.x + next.x;
    const top = rect.top - offset.y + next.y;
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    next.x += Math.min(0, maxX - left) + Math.max(0, 8 - left);
    next.y += Math.min(0, maxY - top) + Math.max(0, 8 - top);
    keptOffset = next;
    setOffset(next);
  };

  // 다시 만들기를 못 꽂은 화면에서는 띠 자체가 없다 — 버튼이 하나뿐이라 그것이
  // 빠지면 빈 껍데기만 남는다.
  if (!reauthorWired) return null;

  return (
    <button
      type="button"
      title={t("detailPage.pageToolbar.reauthor", {
        defaultValue: "이 화면 다시 만들기",
      })}
      aria-label={t("detailPage.pageToolbar.reauthor", {
        defaultValue: "이 화면 다시 만들기",
      })}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        dragged.current = false;
        drag.current = { x: e.clientX, y: e.clientY, from: offset };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={(e) => {
        drag.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }}
      onClick={(e) => {
        e.stopPropagation();
        // 끌어다 놓은 것이 다시 만들기로 이어지면 크레딧이 그냥 나간다.
        if (dragged.current) return;
        requestSectionReauthor(p.id);
      }}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      className="flex h-10 w-10 cursor-grab touch-none items-center justify-center rounded-full border border-dpe-ink-200 bg-dpe-surface/95 shadow-md backdrop-blur-sm transition-colors hover:bg-dpe-ink-100 active:cursor-grabbing"
    >
      <Wand2 size={17} className="text-dpe-ai-alt" />
    </button>
  );
});
DetailPagePageToolbar.displayName = "DetailPagePageToolbar";
