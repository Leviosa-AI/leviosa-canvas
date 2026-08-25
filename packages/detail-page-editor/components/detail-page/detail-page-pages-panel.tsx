"use client";

import { detailPageEditorProfile } from "../../lib/detail-page/editor-profile";

import { useCallback, useState, useSyncExternalStore } from "react";
import { observer } from "./canvas-observer";
import { useTranslation } from "react-i18next";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { detailPageThumbnailBus } from "./detail-page-thumbnail-bus";
import { FillControl } from "./fill-control";

/**
 * Custom Canvas side-panel "페이지" section (hookable-style page list).
 *
 * Two reasons it is custom, not stock:
 *  1. The stock ``PagesPanel`` writes ``store.toDataURL({pageId})`` straight into
 *     an <img src>, but this Canvas build's ``toDataURL`` is **async**, so the
 *     stock panel shows ``src="[object Promise]"`` (blank). We await + cache it
 *     via the workspace and read from the bus here.
 *  2. We want hookable's horizontal rows: drag handle + thumbnail + 역할/제목,
 *     drag-to-reorder, and click-to-scroll (the workspace scrolls to the page
 *     when it becomes active — see StackedCanvasWorkspace).
 *
 * Reordering uses ``@dnd-kit`` (same as the cardnews thumbnail strip), NOT native
 * HTML5 ``draggable``. Native DnD gives the OS "file drag" ghost + green "+"
 * cursor and drags freely in 2D. dnd-kit keeps the drag pointer-based, locked to
 * the vertical axis, and animates the other rows aside to show the drop target.
 */

type TextChild = { type?: string; text?: string; fontSize?: number };
type PageLike = {
  id: string;
  name?: string;
  computedWidth: number;
  computedHeight: number;
  children?: TextChild[];
  /** 단색 hex 또는 `linear-gradient(...)` 문자열. `FillControl`이 둘 다 만든다. */
  background?: string;
  set?: (props: Record<string, unknown>) => void;
};
type StoreLike = {
  pages: PageLike[];
  activePage?: PageLike;
  selectPage: (id: string) => void;
  setPageZIndex: (id: string, index: number) => void;
};

type TFn = (key: string, opts?: Record<string, unknown>) => string;

// Decomposer page roles → localized section labels (fallback: raw name).
function pageLabel(
  page: PageLike,
  index: number,
  t: TFn,
): { role: string; title: string } {
  const role = page.name
    ? t(`detailPage.pages.roles.${page.name}`, { defaultValue: page.name })
    : t("detailPage.pages.pageN", { number: index + 1 });
  let title = "";
  let maxFs = -1;
  for (const child of page.children ?? []) {
    if (child.type !== "text") continue;
    const text = (child.text ?? "").trim();
    if (!text) continue;
    const fs = child.fontSize ?? 0;
    if (fs > maxFs) {
      maxFs = fs;
      title = text;
    }
  }
  title = title.replace(/\s+/g, " ").slice(0, 22);
  return { role, title };
}

// Lock the dragged row to the vertical axis (no @dnd-kit/modifiers pkg installed).
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

// ── Sortable row ────────────────────────────────────────────────────────────────

const PageRow = observer(function PageRow({
  store,
  page,
  index,
  thumb,
}: {
  store: StoreLike;
  page: PageLike;
  index: number;
  thumb: string | undefined;
}) {
  const { t } = useTranslation("branding");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });

  const active = store.activePage?.id === page.id;
  const ratio = page.computedHeight / Math.max(1, page.computedWidth);
  const { role, title } = pageLabel(page, index, t);
  const [editingBackground, setEditingBackground] = useState(false);
  const background = page.background || "#ffffff";

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Lift the dragged row above its siblings while they animate aside.
    zIndex: isDragging ? 20 : undefined,
    position: isDragging ? "relative" : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      onClick={() => {
        if (!isDragging) store.selectPage(page.id);
      }}
      className={[
        "select-none rounded-dpe-xl border bg-dpe-surface p-2 transition-shadow",
        isDragging
          ? "border-dpe-ink-800 shadow-lg"
          : active
            ? "cursor-pointer border-dpe-ink-800 shadow-sm"
            : "cursor-pointer border-dpe-ink-200 hover:border-dpe-ink-300",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
      <span
        {...listeners}
        aria-label={t("detailPage.pages.reorderHandle")}
        className={[
          "shrink-0 touch-none rounded text-dpe-ink-300 hover:text-dpe-ink-500",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        ].join(" ")}
      >
        <GripVertical aria-hidden="true" size={16} />
      </span>
      <div
        className="relative shrink-0 overflow-hidden rounded-dpe-md border border-dpe-ink-100 bg-dpe-ink-50"
        style={{ width: 64, height: Math.min(80, Math.max(40, 64 * ratio)) }}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={title || t("detailPage.pages.pageN", { number: index + 1 })}
            draggable={false}
            className="h-full w-full object-cover object-top"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="text-dpe-ink-400">{role}</span>
          {title ? (
            <>
              <span className="mx-1 text-dpe-ink-300">|</span>
              <span className="font-dpe-bold text-dpe-ink-900">{title}</span>
            </>
          ) : null}
        </p>
      </div>
      {/*
        페이지 배경. 우측 인스펙터에도 같은 컨트롤이 있지만 **아무것도 선택 안 됐을 때만**
        뜬다 — 20섹션짜리 문서를 만지는 동안 선택이 비는 순간이 거의 없어서 사실상 안 보였다.
        쓰기는 우측과 똑같이 `page.set({background})`이라 상태가 갈라지지 않는다.
      */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setEditingBackground((open) => !open);
        }}
        aria-label={t("detailPage.pages.background")}
        aria-expanded={editingBackground}
        title={t("detailPage.pages.background")}
        className="h-6 w-6 shrink-0 rounded-dpe-md border border-dpe-ink-200 hover:border-dpe-ink-400"
        style={{ background }}
      />
      </div>
      {editingBackground ? (
        <div
          className="mt-2 border-t border-dpe-ink-100 pt-2"
          onClick={(event) => event.stopPropagation()}
        >
          <FillControl
            value={background}
            onChange={(next) => page.set?.({ background: next })}
          />
        </div>
      ) : null}
    </div>
  );
});
PageRow.displayName = "PageRow";

// ── Panel ─────────────────────────────────────────────────────────────────────

export const DetailPagePagesPanel = observer(function DetailPagePagesPanel({
  store,
}: {
  store: unknown;
}) {
  const { t } = useTranslation("branding");
  const s = store as StoreLike;

  // Thumbnails are produced by the workspace (correct Konva instance) and shared
  // through the bus; re-render whenever a new one lands.
  useSyncExternalStore(
    detailPageThumbnailBus.subscribe,
    detailPageThumbnailBus.getVersion,
    detailPageThumbnailBus.getVersion,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // A small threshold so a plain click still selects (no drag starts).
      activationConstraint: { distance: 4 },
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const toIndex = s.pages.findIndex((p) => p.id === over.id);
      if (toIndex === -1) return;
      s.setPageZIndex(active.id as string, toIndex);
    },
    [s],
  );

  // 판이 고정 크기면(캐러셀) 높이를 «더하지 않는다». 상세페이지는 세로로 이어진 한 장이라
  // 합계가 곧 문서 높이지만, 캐러셀은 판이 따로따로라 합계가 아무 뜻이 없다 —
  // 8판짜리가 1080×10800 으로 보였다.
  const profile = detailPageEditorProfile();
  const width = Math.round(s.pages[0]?.computedWidth ?? 0);
  const shownHeight = profile.page.fixed
    ? Math.round(
        typeof profile.page.height === "number"
          ? profile.page.height
          : s.pages[0]?.computedHeight ?? 0,
      )
    : Math.round(s.pages.reduce((acc, p) => acc + p.computedHeight, 0));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between px-4 py-3">
        <p className="text-base font-dpe-bold text-dpe-ink-900">
          {t("detailPage.pages.totalPages", { count: s.pages.length })}
        </p>
        <p className="text-xs text-dpe-ink-400">
          {width} × {shownHeight} px
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={s.pages.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {s.pages.map((page, index) => (
                <PageRow
                  key={page.id}
                  store={s}
                  page={page}
                  index={index}
                  thumb={detailPageThumbnailBus.get(page.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
});
DetailPagePagesPanel.displayName = "DetailPagePagesPanel";
