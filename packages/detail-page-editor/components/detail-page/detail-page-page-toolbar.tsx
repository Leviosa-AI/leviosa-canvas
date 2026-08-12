"use client";

import { useSyncExternalStore } from "react";
import { observer } from "./canvas-observer";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  ChevronUp,
  ChevronDown,
  Copy,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";

import {
  isSectionReauthorWired,
  requestSectionReauthor,
  subscribeSectionReauthorAvailability,
} from "../../lib/detail-page/section-reauthor-bus";

/**
 * hookable-style per-section (per-page) floating quick toolbar.
 *
 * Renders a vertical pill next to the active page with: AI, move up, move down,
 * duplicate, add, delete. The actions mirror the stock editor's stock ``<PageControls>``
 * (`page.setZIndex` / `page.clone` / `store.addPage` / `store.deletePages`) so
 * behaviour matches the SDK exactly — we just restyle it as a vertical rail and
 * disable the stock controls in the workspace.
 */

type PageLike = {
  id: string;
  bleed?: number;
  width?: number | string;
  height?: number | string;
  setZIndex: (index: number) => void;
  clone: () => void;
};
type StoreLike = {
  pages: PageLike[];
  activePage?: { id: string; bleed?: number; width?: number | string; height?: number | string };
  addPage: (props: Record<string, unknown>) => PageLike;
  deletePages: (ids: string[]) => void;
  openSidePanel?: (name: string) => void;
};

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
        disabled
          ? "cursor-not-allowed text-neutral-300"
          : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

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
  const s = store as StoreLike;
  const p = page as PageLike;
  const index = s.pages.findIndex((pg) => pg.id === p.id);
  const isFirst = index <= 0;
  const isLast = index === s.pages.length - 1;
  const canDelete = s.pages.length > 1;

  const addAfter = () => {
    const ref = s.activePage ?? s.pages[index];
    const next = s.addPage({
      bleed: ref?.bleed ?? 0,
      width: ref?.width ?? "auto",
      height: ref?.height ?? "auto",
    });
    next.setZIndex(index + 1);
  };

  return (
    <div className="flex flex-col items-center gap-0.5 rounded-2xl border border-neutral-200 bg-white/95 px-1 py-1.5 shadow-md backdrop-blur-sm">
      <button
        type="button"
        title={t("detailPage.pageToolbar.aiGenerate")}
        aria-label={t("detailPage.pageToolbar.aiGenerate")}
        onClick={(e) => {
          e.stopPropagation();
          s.openSidePanel?.("ai-generate");
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-neutral-100"
      >
        <Sparkles size={17} className="text-fuchsia-500" />
      </button>

      {/* 이 화면만 마크업째 다시 만든다 — 슬롯 카피 편집과 달리 칸 수·표 같은 구조가
          바뀔 수 있다. 요청만 띄우고 실제 일(모달·API·페이지 교체)은 편집기가 한다. */}
      {reauthorWired ? (
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
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-neutral-100"
        >
          <Wand2 size={16} className="text-violet-500" />
        </button>
      ) : null}

      <hr className="my-0.5 w-5 border-neutral-200" />

      <IconButton label={t("detailPage.pageToolbar.moveUp")} onClick={() => p.setZIndex(index - 1)} disabled={isFirst}>
        <ChevronUp size={17} />
      </IconButton>
      <IconButton label={t("detailPage.pageToolbar.moveDown")} onClick={() => p.setZIndex(index + 1)} disabled={isLast}>
        <ChevronDown size={17} />
      </IconButton>
      <IconButton label={t("detailPage.pageToolbar.duplicate")} onClick={() => p.clone()}>
        <Copy size={16} />
      </IconButton>
      <IconButton label={t("detailPage.pageToolbar.addBelow")} onClick={addAfter}>
        <Plus size={17} />
      </IconButton>

      <hr className="my-0.5 w-5 border-neutral-200" />

      <IconButton label={t("detailPage.pageToolbar.delete")} onClick={() => s.deletePages([p.id])} disabled={!canDelete}>
        <Trash2 size={16} />
      </IconButton>
    </div>
  );
});
DetailPagePageToolbar.displayName = "DetailPagePageToolbar";
