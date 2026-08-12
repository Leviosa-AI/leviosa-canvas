"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Palette } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useDetailPageHost } from "./detail-page-host-context";

export function DetailPageBrandKitPanel({ store }: { store: unknown }) {
  // 킷을 그리는 화면은 브랜드 도메인이라 호스트가 꽂는다. 편집기는 활성 브랜드의
  // 무드보드를 불러 킷으로 바꾼 뒤 그 자리에 넘길 뿐이다.
  const { brand, queryKeys, slots } = useDetailPageHost();
  const { t } = useTranslation("branding");
  const {
    brands,
    activeBrand,
    activeBrandId,
    setActiveBrandId,
    isLoading: brandsLoading,
  } = brand.useBrandWorkspace();
  const assetsQuery = useQuery({
    queryKey: queryKeys.branding.brandAssets(activeBrandId),
    queryFn: ({ signal }) => brand.listBrandAssets(activeBrandId!, signal),
    enabled: Boolean(activeBrandId),
    staleTime: 4 * 60_000,
  });
  const moodboardQuery = useQuery({
    queryKey: queryKeys.branding.brandMoodboard(activeBrandId),
    queryFn: ({ signal }) =>
      brand.loadBrandMoodboard(activeBrand!, assetsQuery.data ?? [], signal),
    enabled: Boolean(activeBrand && assetsQuery.data),
  });

  if (brandsLoading || assetsQuery.isLoading || moodboardQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-400">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  const KitPanel = slots?.BrandKitPanel;
  if (!activeBrand || !moodboardQuery.data || !KitPanel) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-5 text-center text-neutral-400">
        <Palette size={22} />
        <p className="text-xs">{t("detailPage.brandAssets.kitEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-neutral-200 p-3">
        <label className="grid gap-1 text-[11px] font-medium text-neutral-500">
          {t("detailPage.brandAssets.activeBrand")}
          <select
            value={activeBrand.id}
            onChange={(event) => setActiveBrandId(event.target.value)}
            className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-800"
          >
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <KitPanel
        kit={brand.deriveBrandKit(moodboardQuery.data)}
        store={store as never}
        className="flex-1"
      />
    </div>
  );
}
