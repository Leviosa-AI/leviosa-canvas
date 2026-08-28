"use client";

import { detailPageEditorProfile } from "../../lib/detail-page/editor-profile";

import { Fragment, useCallback, useSyncExternalStore } from "react";
import { observer } from "./canvas-observer";
import { useTranslation } from "react-i18next";
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";
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
  clone?: () => void;
  /** 문서 안 몇 번째인가를 바꾼다. 페이지 자신이 가진 함수다 — 스토어에는 없다. */
  setZIndex?: (index: number) => void;
};
type StoreLike = {
  pages: PageLike[];
  activePage?: PageLike;
  selectPage: (id: string) => void;
  addPage: (props: Record<string, unknown>) => PageLike;
  deletePages?: (ids: string[]) => void;
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

/** 두 화면 사이에 새 화면을 끼우는 자리. 평소엔 선 한 줄, 올리면 «+» 가 뜬다. */
function InsertHere({
  store,
  after,
  disabled,
}: {
  store: StoreLike;
  after: number;
  disabled?: boolean;
}) {
  const { t } = useTranslation("branding");
  if (disabled) return null;

  const insert = () => {
    const ref = store.pages[after];
    const profile = detailPageEditorProfile();
    const next = store.addPage({
      width:
        profile.page.width === "document"
          ? (ref?.computedWidth ?? "auto")
          : profile.page.width,
      height: profile.page.fixed
        ? profile.page.height
        : (ref?.computedHeight ?? profile.page.height),
    });
    next.setZIndex?.(after + 1);
    store.selectPage(next.id);
  };

  return (
    <div className="group/insert relative h-3">
      <button
        type="button"
        aria-label={t("detailPage.pageToolbar.addBelow")}
        title={t("detailPage.pageToolbar.addBelow")}
        onClick={insert}
        className="absolute inset-x-0 top-0 flex h-3 items-center justify-center"
      >
        <span className="h-px flex-1 bg-dpe-ink-200 opacity-0 transition-opacity group-hover/insert:opacity-100" />
        <span className="mx-1 flex h-4 w-4 items-center justify-center rounded-full border border-dpe-ink-200 bg-dpe-surface text-dpe-ink-500 opacity-0 transition-opacity group-hover/insert:opacity-100">
          <Plus aria-hidden="true" size={11} />
        </span>
        <span className="h-px flex-1 bg-dpe-ink-200 opacity-0 transition-opacity group-hover/insert:opacity-100" />
      </button>
    </div>
  );
}

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
  const maxPages = detailPageEditorProfile().maxPages;

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
        {/* 복제 / 삭제. 판을 고르지 않아도 목록에서 바로 되게 둔다. */}
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            disabled={store.pages.length >= maxPages}
            onClick={(event) => {
              event.stopPropagation();
              page.clone?.();
            }}
            aria-label={t("detailPage.pageToolbar.duplicate")}
            title={t("detailPage.pageToolbar.duplicate")}
            className="flex h-6 w-6 items-center justify-center rounded-dpe-md border border-dpe-ink-200 text-dpe-ink-500 hover:border-dpe-ink-400 hover:text-dpe-ink-800 disabled:cursor-not-allowed disabled:text-dpe-ink-200 disabled:hover:border-dpe-ink-200"
          >
            <Copy aria-hidden="true" size={13} />
          </button>
          <button
            type="button"
            disabled={store.pages.length <= 1}
            onClick={(event) => {
              event.stopPropagation();
              store.deletePages?.([page.id]);
            }}
            aria-label={t("detailPage.pageToolbar.delete")}
            title={t("detailPage.pageToolbar.delete")}
            className="flex h-6 w-6 items-center justify-center rounded-dpe-md border border-dpe-ink-200 text-dpe-ink-500 hover:border-dpe-ink-400 hover:text-dpe-danger-600 disabled:cursor-not-allowed disabled:text-dpe-ink-200 disabled:hover:border-dpe-ink-200"
          >
            <Trash2 aria-hidden="true" size={13} />
          </button>
        </div>
      </div>
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
      // 순서를 바꾸는 것은 페이지 자신이다. 스토어에 `setPageZIndex` 는 없어서
      // 끌어다 놓을 때마다 «is not a function» 으로 죽었다.
      s.pages.find((p) => p.id === active.id)?.setZIndex?.(toIndex);
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
          : (s.pages[0]?.computedHeight ?? 0),
      )
    : Math.round(s.pages.reduce((acc, p) => acc + p.computedHeight, 0));

  const canAdd = s.pages.length < profile.maxPages;

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
                <Fragment key={page.id}>
                  <PageRow
                    store={s}
                    page={page}
                    index={index}
                    thumb={detailPageThumbnailBus.get(page.id)}
                  />
                  {/* 새 화면은 «어디에» 가 먼저다. 목록 끝에 버튼 하나를 두면 넣고 나서
                      다시 끌어 옮기게 되므로, 넣을 자리마다 하나씩 둔다. */}
                  <InsertHere store={s} after={index} disabled={!canAdd} />
                </Fragment>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
});
DetailPagePagesPanel.displayName = "DetailPagePagesPanel";
