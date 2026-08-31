"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ImageOff, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PanelSearchInput } from "./panel-search-input";
import { encodeSvgDataUri } from "../../lib/detail-page-canvas/export/svg";
import { insertShape } from "../../lib/detail-page/insert-shape";
import { rememberElement } from "../../lib/detail-page/element-recents";
import { applyCurrentColor } from "../../lib/detail-page/svg-colors";
import { searchIcons, type IconGroup, type IconItem } from "../../lib/detail-page/icons";
import type { IconStyle } from "../../lib/detail-page/icon-search";
import { useDetailPageHost } from "./detail-page-host-context";

/**
 * "요소 · 아이콘" 그룹 — 오픈 라이선스 아이콘 검색.
 *
 * 사진 패널이 Pexels를 중계하는 것과 같은 자리인데 두 가지가 다르다.
 *
 *  1. **S3로 옮겨 담지 않는다.** 아이콘은 삽입 순간 마크업이 문서에 박혀서 저장된
 *     상세페이지가 제공처 수명에 묶이지 않는다.
 *  2. **세트 이름을 안 보여 준다.** "Tabler에서 찾기"는 사용자에게 아무 의미가 없다.
 *     축은 **선 / 채움** 둘뿐이다 — 상세페이지는 아이콘 스타일이 섞이면 바로 티가 난다.
 *
 * 브랜드 로고(Simple Icons)는 상표라 일반 아이콘과 섞지 않고 그룹을 나눈다.
 */

const DEBOUNCE_MS = 400;

export function DetailPageIconsPanel({ store }: { store: unknown }) {
  const { brand, queryKeys } = useDetailPageHost();
  const { t } = useTranslation("branding");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [style, setStyle] = useState<IconStyle>("stroke");
  const [group, setGroup] = useState<IconGroup>("icons");
  const brandColor = brand.useBrandPrimaryColor();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // 로고에는 선/채움 축이 없다 — 세트가 하나고 전부 채움이다.
  const effectiveStyle = group === "logos" ? undefined : style;

  const icons = useInfiniteQuery({
    queryKey: queryKeys.branding.detailPageIcons(debounced, group, effectiveStyle),
    queryFn: ({ pageParam, signal }) =>
      searchIcons({ query: debounced, group, style: effectiveStyle, page: pageParam, signal }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 30 * 60_000,
    retry: false,
  });

  const pages = useMemo(() => icons.data?.pages ?? [], [icons.data]);
  const items = useMemo(() => pages.flatMap((page) => page.items), [pages]);
  const truncated = pages.length > 0 && pages[pages.length - 1].truncated;

  // 격자 바닥이 보이면 다음 쪽. 스크롤 컨테이너가 곧 관찰 뿌리다.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = icons;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage) return;
    // jsdom·구형 브라우저 대비. 관찰이 안 되면 아래 "더 보기" 버튼이 남는다.
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
      },
      { root: scrollRef.current, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, items.length]);

  // 격자 미리보기도 실제로 넣을 색으로 그린다 — 눌러 보고 다른 색이 나오면 안 된다.
  const cells = useMemo(
    () =>
      items.map((item) => ({
        item,
        markup: applyCurrentColor(item.markup, brandColor),
      })),
    [items, brandColor],
  );

  const insert = useCallback(
    (item: IconItem, markup: string) => {
      insertShape(store, markup, item.viewBox);
      rememberElement({
        key: item.id,
        markup,
        viewBox: item.viewBox,
        label: item.id.split(":")[1] ?? item.id,
      });
    },
    [store],
  );

  return (
    // 스크롤은 **격자만** 한다. 패널 전체를 스크롤러로 두면 검색창과 토글이 같이
    // 밀려 올라가고, 그 안의 `flex-1 min-h-0` 격자가 남는 높이에 맞춰 줄어들면서
    // 컨테이너가 아예 넘치지 않아 스크롤바 자체가 안 생긴다.
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-3">
        <PanelSearchInput
          value={query}
          onChange={setQuery}
          placeholder={t("detailPage.icons.searchPlaceholder")}
          label={t("detailPage.icons.searchLabel")}
        />
      </div>

      <div className="mt-2 flex shrink-0 gap-1.5 px-3">
        <SegmentedGroup
          label={t("detailPage.icons.groupLabel")}
          value={group}
          onChange={setGroup}
          options={[
            { value: "icons", label: t("detailPage.icons.groupIcons") },
            { value: "logos", label: t("detailPage.icons.groupLogos") },
          ]}
        />
        {group === "icons" ? (
          <SegmentedGroup
            label={t("detailPage.icons.styleLabel")}
            value={style}
            onChange={setStyle}
            options={[
              { value: "stroke", label: t("detailPage.icons.styleStroke") },
              { value: "fill", label: t("detailPage.icons.styleFill") },
            ]}
          />
        ) : null}
      </div>

      {group === "logos" ? (
        // 파일은 CC0지만 로고 자체는 상표다. 안내를 지우면 이용 조건을 어기는 쪽으로 샌다.
        <p className="mx-3 mt-2 shrink-0 rounded-le-md bg-le-warn-50 px-2 py-1.5 text-[11px] leading-relaxed text-le-warn-800">
          {t("detailPage.icons.logoTrademark")}
        </p>
      ) : null}

      <div ref={scrollRef} className="mt-3 min-h-0 flex-1 overflow-y-auto px-3">
        {icons.isPending ? (
          <div className="flex justify-center py-6 text-le-ink-400">
            <Loader2 aria-hidden="true" className="animate-spin" size={20} />
          </div>
        ) : icons.isError ? (
          <p className="text-xs text-le-danger-600">{t("detailPage.icons.failed")}</p>
        ) : cells.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-le-ink-400">
            <ImageOff aria-hidden="true" size={20} />
            <p className="text-xs">{t("detailPage.icons.empty")}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-1.5">
              {cells.map(({ item, markup }) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => insert(item, markup)}
                  title={t("detailPage.shapes.insertHint")}
                  aria-label={item.id}
                  className="flex aspect-square items-center justify-center rounded-le-lg border border-le-ink-200 p-1.5 hover:border-le-ink-400"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={encodeSvgDataUri(markup)}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                </button>
              ))}
            </div>
            <div ref={sentinelRef} aria-hidden="true" className="h-px" />
            {isFetchingNextPage ? (
              <div className="flex justify-center py-3 text-le-ink-400">
                <Loader2 aria-hidden="true" className="animate-spin" size={16} />
              </div>
            ) : hasNextPage ? (
              // 관찰이 안 되는 환경(구형 브라우저·테스트)에서도 이어 받을 수 있어야 한다.
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                className="mt-2 w-full rounded-le-md border border-le-ink-200 py-1.5 text-[11px] font-le-medium text-le-ink-500 hover:bg-le-ink-50"
              >
                {t("detailPage.icons.loadMore")}
              </button>
            ) : truncated ? (
              // 조용히 자르면 "이게 전부"로 읽힌다.
              <p className="mt-2 px-1 text-[11px] text-le-ink-400">
                {t("detailPage.icons.truncated")}
              </p>
            ) : null}
          </>
        )}
      </div>

      <p className="shrink-0 border-t border-le-ink-100 px-3 py-2 text-[11px] leading-relaxed text-le-ink-500">
        {t("detailPage.icons.licenseHint")}
      </p>
    </div>
  );
}

function SegmentedGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-1 rounded-le-md border border-le-ink-200 p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded px-2 py-1 text-[11px] font-le-medium transition-colors ${
              active
                ? "bg-le-ink-900 text-le-on-accent"
                : "text-le-ink-500 hover:bg-le-ink-100"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
