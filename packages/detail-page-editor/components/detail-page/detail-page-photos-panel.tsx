"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ImageOff, Loader2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PanelSearchInput } from "./panel-search-input";
import { isAnimatedFile } from "../../lib/detail-page/animation-sniff";
import { insertPersonalImage } from "../../lib/detail-page/insert-image";
import { useDetailPageHost } from "./detail-page-host-context";
import {
  mirrorStockPhoto,
  searchStockPhotos,
  type StockPhoto,
} from "../../lib/detail-page/stock-photos";

/**
 * "사진" 패널 — 올리기 + 무료 스톡 사진 검색(Pexels).
 *
 * 고른 사진은 우리 S3로 옮겨 담은 뒤 얹는다(`mirrorStockPhoto`). 남의 주소를 문서에
 * 박으면 저장된 상세페이지가 그 서버 수명에 묶인다.
 *
 * 하단의 "Pexels 제공" 링크와 사진별 작가 표기는 장식이 아니라 **제공처가 요구하는
 * 출처 표기**다 — 지우면 이용 조건을 어긴다.
 */

const PER_PAGE = 24;
const DEBOUNCE_MS = 400;

export function DetailPagePhotosPanel({
  store,
  uploadFile,
}: {
  store: unknown;
  /** 파일 → 접근 가능한 URL. 편집기가 자기 업로더를 그대로 넘긴다. */
  uploadFile?: (file: File) => Promise<string>;
}) {
  const { t } = useTranslation("branding");
  const { queryKeys } = useDetailPageHost();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 이번 편집 동안 올린 것들. 새로고침하면 사라진다 — 오래 두는 자리는 "브랜드 이미지"다.
  const [recent, setRecent] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  /** 지금 옮겨 담는 중인 사진. 타일 하나에만 스피너를 씌운다. */
  const [inserting, setInserting] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const stock = useInfiniteQuery({
    queryKey: queryKeys.branding.detailPageStockPhotos(debounced),
    queryFn: ({ pageParam, signal }) =>
      searchStockPhotos({
        query: debounced,
        page: pageParam,
        perPage: PER_PAGE,
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (last.hasMore ? all.length + 1 : undefined),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const pages = stock.data?.pages ?? [];
  const photos = pages.flatMap((page) => page.photos);
  const configured = pages[0]?.configured ?? true;

  const take = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || !uploadFile) return;
      setBusy(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          const url = await uploadFile(file);
          setRecent((prev) => [url, ...prev]);
          // 확장자·MIME 으로는 가를 수 없다 — 움직이는 WebP 와 정지 WebP 가 둘 다
          // image/webp 라서, 바이트를 봐야 애니메이션 태그가 정확히 붙는다.
          insertPersonalImage(store, url, { isGif: await isAnimatedFile(file) });
        }
      } catch {
        setError(t("detailPage.photos.uploadFailed"));
      } finally {
        setBusy(false);
      }
    },
    [store, t, uploadFile],
  );

  const insertStock = useCallback(
    async (photo: StockPhoto) => {
      setInserting(photo.id);
      setError(null);
      try {
        const src = await mirrorStockPhoto(photo, uploadFile);
        insertPersonalImage(store, src);
      } catch {
        setError(t("detailPage.photos.stockInsertFailed"));
      } finally {
        setInserting(null);
      }
    },
    [store, t, uploadFile],
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <button
        type="button"
        disabled={!uploadFile || busy}
        onClick={() => inputRef.current?.click()}
        className="flex items-center justify-center gap-2 rounded-le-lg border border-dashed border-le-ink-300 px-3 py-4 text-sm font-le-medium text-le-ink-600 hover:border-le-ink-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={16} />
        ) : (
          <Upload aria-hidden="true" size={16} />
        )}
        {t("detailPage.photos.upload")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          void take(event.target.files);
          event.target.value = "";
        }}
      />

      {error ? <p className="text-xs text-le-danger-600">{error}</p> : null}

      {recent.length ? (
        <div className="grid grid-cols-3 gap-2">
          {recent.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => insertPersonalImage(store, url)}
              className="aspect-square overflow-hidden rounded-le-lg border border-le-ink-200 hover:border-le-ink-400"
              title={t("detailPage.shapes.insertHint")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      <PanelSearchInput
        value={query}
        onChange={setQuery}
        placeholder={t("detailPage.photos.searchPlaceholder")}
        label={t("detailPage.photos.searchLabel")}
      />

      {!configured ? (
        <p className="px-1 text-xs leading-relaxed text-le-ink-500">
          {t("detailPage.photos.stockUnavailable")}
        </p>
      ) : stock.isLoading ? (
        <div className="flex justify-center py-6 text-le-ink-400">
          <Loader2 aria-hidden="true" className="animate-spin" size={20} />
        </div>
      ) : stock.error ? (
        <p className="text-xs text-le-danger-600">
          {t("detailPage.photos.stockFailed")}
        </p>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-le-ink-400">
          <ImageOff aria-hidden="true" size={20} />
          <p className="text-xs">{t("detailPage.photos.stockEmpty")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="group relative overflow-hidden rounded-le-lg border border-le-ink-200 hover:border-le-ink-400"
              >
                <button
                  type="button"
                  disabled={inserting !== null}
                  onClick={() => void insertStock(photo)}
                  className="block w-full disabled:cursor-wait"
                  title={t("detailPage.photos.stockInsertHint")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumb}
                    alt={photo.alt}
                    loading="lazy"
                    className="h-24 w-full object-cover transition group-hover:opacity-90"
                  />
                  {inserting === photo.id ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-le-surface/70">
                      <Loader2
                        aria-hidden="true"
                        className="animate-spin text-le-ink-500"
                        size={18}
                      />
                    </span>
                  ) : null}
                </button>
                {/* 작가 표기 — 제공처 이용 조건이 요구한다. */}
                <a
                  href={photo.pageUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="absolute bottom-0 left-0 right-0 hidden truncate bg-le-scrim/60 px-1.5 py-1 text-[10px] text-le-on-accent group-hover:block hover:underline"
                >
                  {photo.photographer}
                </a>
              </div>
            ))}
          </div>

          {stock.hasNextPage ? (
            <button
              type="button"
              disabled={stock.isFetchingNextPage}
              onClick={() => void stock.fetchNextPage()}
              className="mx-auto flex items-center gap-1.5 rounded-le-md border border-le-ink-200 px-3 py-1.5 text-xs font-le-medium text-le-ink-600 hover:border-le-ink-400 disabled:opacity-50"
            >
              {stock.isFetchingNextPage ? (
                <Loader2 aria-hidden="true" className="animate-spin" size={12} />
              ) : null}
              {t("detailPage.photos.stockMore")}
            </button>
          ) : null}
        </>
      )}

      <p className="mt-auto px-1 pt-1 text-xs leading-relaxed text-le-ink-500">
        {t("detailPage.photos.hint")}{" "}
        <a
          href="https://www.pexels.com"
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2"
        >
          {t("detailPage.photos.stockCredit")}
        </a>
      </p>
    </div>
  );
}
