"use client";

/**
 * 작업 영역 아래 붙는 화면 띠 (G7-b).
 *
 * 스톡 ``PagesTimeline``의 자리다. 20~30 화면짜리 문서에서 "지금 몇 번째를 보고
 * 있는가"와 "저기로 건너뛰기"만 하면 되므로, 이 띠는 그 둘만 한다.
 *
 * 썸네일을 **여기서 굽지 않는다.** 굽는 일은 화면 밖 페이지를 잠깐 띄우는 일이라
 * 30장이면 편집기가 눈에 띄게 멈춘다. 이미 구워져 있으면(페이지 패널을 한 번 열면
 * 그때 굽는다) 그 그림을 쓰고, 없으면 번호 칩으로 둔다.
 */

import { useSyncExternalStore } from "react";

import { detailPageThumbnailBus } from "./detail-page-thumbnail-bus";
import { observer } from "./canvas-observer";

type PageLike = { id: string; name?: unknown };
type StoreLike = {
  pages: PageLike[];
  activePage?: { id: string } | null;
  selectPage: (id: string) => void;
};

export const DetailPagePagesTimeline = observer(function DetailPagePagesTimeline({
  store,
}: {
  store: unknown;
}) {
  const s = store as StoreLike;
  useSyncExternalStore(
    detailPageThumbnailBus.subscribe,
    detailPageThumbnailBus.getVersion,
    () => 0,
  );
  const activeId = s.activePage?.id;

  if (s.pages.length < 2) return null;

  return (
    <div
      data-dp-pages-timeline=""
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex items-center gap-1.5 overflow-x-auto border-t border-dpe-ink-200 bg-dpe-surface/95 px-3 py-1.5 backdrop-blur-sm"
    >
      {s.pages.map((page, index) => {
        const active = page.id === activeId;
        const thumb = detailPageThumbnailBus.get(page.id);
        return (
          <button
            key={page.id}
            type="button"
            onClick={() => s.selectPage(page.id)}
            aria-current={active ? "true" : undefined}
            title={typeof page.name === "string" ? page.name : `${index + 1}`}
            className={[
              "flex h-10 w-8 shrink-0 items-center justify-center overflow-hidden rounded border text-[11px] font-dpe-semibold transition-colors",
              active
                ? "border-dpe-ink-900 bg-dpe-ink-900 text-dpe-on-accent"
                : "border-dpe-ink-200 bg-dpe-surface text-dpe-ink-500 hover:border-dpe-ink-400",
            ].join(" ")}
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt={`${index + 1}`}
                className="h-full w-full object-cover"
              />
            ) : (
              index + 1
            )}
          </button>
        );
      })}
    </div>
  );
});
DetailPagePagesTimeline.displayName = "DetailPagePagesTimeline";
