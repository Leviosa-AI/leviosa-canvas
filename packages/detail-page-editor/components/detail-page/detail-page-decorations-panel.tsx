"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useDetailPageHost } from "./detail-page-host-context";
import type { DetailPageShapeLibraryItem } from "./detail-page-host-context";
import { encodeSvgDataUri } from "../../lib/detail-page-canvas/export/svg";
import { insertShape } from "../../lib/detail-page/insert-shape";
import { rememberElement } from "../../lib/detail-page/element-recents";

/**
 * "장식" 패널 — 우리 템플릿에서 추린 **공용 장식 카탈로그**(읽기전용, 클릭 삽입).
 *
 * 카탈로그는 서버가 세 갈래로 나눠 준다: `icon` · `badge` · `line`.
 * 여기서는 **`icon`을 안 쓴다.** 그건 루시드류 단색 픽토그램이고, "아이콘" 그룹이 같은
 * 것을 2만 개 규모로 검색까지 붙여 덮는다. 36개짜리 사본을 옆에 두면 사용자는 어느 쪽을
 * 봐야 하는지부터 고민하게 된다.
 *
 * 남는 `badge`(배지 바탕·씰·말풍선)와 `line`(선 장식·구분)이 이 패널의 전부다.
 * 개인 도형("내 도형")과는 별개다.
 */

/** 공용 카탈로그에서 "장식"으로 볼 갈래. */
const DECORATION_CATEGORIES = ["badge", "line"] as const;

export function DetailPageDecorationsPanel({ store }: { store: unknown }) {
  const { api, queryKeys } = useDetailPageHost();
  const { t } = useTranslation("branding");
  // 카탈로그는 리포에 커밋된 정적 파일이라 배포 사이엔 바뀌지 않는다. 패널은 그룹을
  // 옮길 때마다 언마운트되므로, 컴포넌트 지역 상태로 들고 있으면 열 때마다 1.7MB를
  // 다시 받는다. 쿼리 캐시에 얹어 세션당 한 번만 받는다(서버 ETag/304는 새로고침용).
  const {
    data: items = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: queryKeys.branding.detailPageShapeLibrary(),
    queryFn: ({ signal }) => api.listDetailPageShapeLibrary(signal),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // 수십 KB SVG를 매 렌더마다 다시 인코딩하지 않는다.
  const groups = useMemo(
    () =>
      DECORATION_CATEGORIES.map((category) => ({
        category,
        cells: items
          .filter((item) => item.category === category)
          .map((item) => ({ item, uri: encodeSvgDataUri(item.svg) })),
      })).filter((group) => group.cells.length > 0),
    [items],
  );

  const insert = useCallback(
    (item: DetailPageShapeLibraryItem) => {
      insertShape(store, item.svg, item.view_box);
      rememberElement({
        key: item.id,
        markup: item.svg,
        viewBox: item.view_box,
        label: t(`detailPage.shapes.decorations.${item.category}`),
      });
    },
    [store, t],
  );

  if (isError) {
    return (
      <div className="p-3">
        <p className="text-xs text-dpe-danger-600">{t("detailPage.shapes.decorationsFailed")}</p>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center text-dpe-ink-400">
        <Loader2 aria-hidden="true" className="animate-spin" size={18} />
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="p-3">
        <p className="text-xs text-dpe-ink-400">{t("detailPage.shapes.decorationsEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      {groups.map(({ category, cells }) => (
        <div key={category} className="mb-4 last:mb-0">
          <p className="mb-2 text-xs font-dpe-medium text-dpe-ink-500">
            {t(`detailPage.shapes.decorations.${category}`)}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {cells.map(({ item, uri }) => (
              <button
                key={item.id}
                type="button"
                onClick={() => insert(item)}
                className="flex aspect-square items-center justify-center rounded-dpe-lg border border-dpe-ink-200 p-2 hover:border-dpe-ink-400"
                title={t("detailPage.shapes.insertHint")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uri}
                  alt={t("detailPage.shapes.shapeAlt")}
                  className="max-h-full max-w-full object-contain"
                />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
