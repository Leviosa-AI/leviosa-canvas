"use client";

// 브랜드 자산 패널들(이미지 · GIF · 도형)이 공유하는 머리글.
//
// 어느 브랜드의 자산을 보고 있는지 고르는 셀렉트 + 새로고침. 패널마다 같은 마크업을
// 복사해 두면 한쪽만 고쳐져 "이 패널에서만 브랜드가 안 바뀐다"가 생긴다.

import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useDetailPageHost } from "./detail-page-host-context";

export function BrandPanelHeader({ onRefresh }: { onRefresh: () => void }) {
  const { brand } = useDetailPageHost();
  const { t } = useTranslation("branding");
  const { brands, activeBrandId, setActiveBrandId } = brand.useBrandWorkspace();

  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <label className="grid min-w-0 flex-1 gap-1 text-[11px] font-medium text-neutral-500">
        {t("detailPage.brandAssets.activeBrand")}
        <select
          value={activeBrandId ?? ""}
          onChange={(event) => setActiveBrandId(event.target.value)}
          className="h-8 min-w-0 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-800"
        >
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onRefresh}
        className="mt-4 flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        aria-label={t("detailPage.brandAssets.refresh")}
      >
        <RefreshCw aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
