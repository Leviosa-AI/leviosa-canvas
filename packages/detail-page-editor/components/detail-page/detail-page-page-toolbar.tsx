"use client";

import { useSyncExternalStore } from "react";
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
 */

type PageLike = { id: string };

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
      onClick={(e) => {
        e.stopPropagation();
        requestSectionReauthor(p.id);
      }}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-dpe-ink-200 bg-dpe-surface/95 shadow-md backdrop-blur-sm transition-colors hover:bg-dpe-ink-100"
    >
      <Wand2 size={17} className="text-dpe-ai-alt" />
    </button>
  );
});
DetailPagePageToolbar.displayName = "DetailPagePageToolbar";
