"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ImageOff, Loader2, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import { BrandPanelHeader } from "./detail-page-brand-panel-header";
import { useDetailPageHost } from "./detail-page-host-context";
import type {
  BrandAsset,
  BrandAssetKind,
} from "./detail-page-host-context";
import { insertPersonalImage } from "../../lib/detail-page/insert-image";
import {
  BRAND_IMAGE_CATEGORIES,
  BRAND_IMAGE_CATEGORY_LABEL_KEY,
  countBrandImages,
  groupBrandImages,
  takeBrandImages,
  type BrandImageCategory,
} from "../../lib/detail-page/brand-image-category";
import { useProgressiveReveal } from "../../lib/detail-page/use-progressive-reveal";

const UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function isImageAsset(asset: BrandAsset): boolean {
  return ["logo", "product_image", "model_image", "image", "svg"].includes(
    asset.asset_type,
  );
}

function uploadKind(file: File): BrandAssetKind {
  if (file.type === "image/svg+xml") return "svg";
  return "image";
}

/**
 * 브랜드 이미지 서랍. 앱이 저작 갤러리를 꽂아 주면 두 갈래를 한 자리에서 고른다.
 *
 * - **브랜드 자산** — 셀러가 올려 둔 사진. 오래 사는 물건이다.
 * - **저작 생성 이미지** — 저작이 구운 사진. 한 건이 최대 30장인데 고른 한 벌에
 *   들어가는 것은 열 몇 장이라, 나머지를 여기서 못 찾으면 다음 상품에서 같은 사진을
 *   다시 굽는다.
 *
 * 한 그리드에 섞지 않는 이유는 고르는 방식이 달라서다. 브랜드 자산은 이름으로 찾고,
 * 저작 사진은 "그때 그 상세페이지"로 찾는다 — 뒤쪽은 페이지 단위 묶음이 필요하다.
 *
 * 슬롯이 없으면 탭도 없다. 저작이라는 앱 도메인이 없는 소비자에게 빈 탭을 보이느니
 * 브랜드 자산 하나로 두는 편이 맞다.
 */
export function DetailPageMyImagesPanel({ store }: { store: unknown }) {
  const { slots } = useDetailPageHost();
  const { t } = useTranslation("branding");
  const [source, setSource] = useState<"brand" | "authored">("brand");
  const AuthoredPanel = slots?.AuthoredImagesPanel;

  if (!AuthoredPanel) return <BrandAssetGallery store={store} />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-dpe-ink-200 px-4 pt-3">
        <SourceTab
          label={t("detailPage.brandAssets.sourceBrand")}
          active={source === "brand"}
          onClick={() => setSource("brand")}
        />
        <SourceTab
          label={t("detailPage.brandAssets.sourceAuthored")}
          active={source === "authored"}
          onClick={() => setSource("authored")}
        />
      </div>
      <div className="min-h-0 flex-1">
        {source === "brand" ? (
          <BrandAssetGallery store={store} />
        ) : (
          <AuthoredPanel store={store} />
        )}
      </div>
    </div>
  );
}

function SourceTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "-mb-px border-b-2 px-2.5 pb-2 text-[11px] font-dpe-medium " +
        (active
          ? "border-dpe-ink-800 text-dpe-ink-800"
          : "border-transparent text-dpe-ink-400 hover:text-dpe-ink-600")
      }
    >
      {label}
    </button>
  );
}

/**
 * 갈래 토글. **비어 있는 갈래는 내지 않는다** — 눌러 봐야 빈 화면인 칸은 고르는
 * 일을 돕는 게 아니라 늘린다. 숫자는 거르기 전 전체라 갈아타도 흔들리지 않는다.
 */
function CategoryFilter({
  counts,
  total,
  value,
  onChange,
}: {
  counts: Record<BrandImageCategory, number>;
  total: number;
  value: BrandImageCategory | "all";
  onChange: (next: BrandImageCategory | "all") => void;
}) {
  const { t } = useTranslation("branding");
  const available = BRAND_IMAGE_CATEGORIES.filter(
    (category) => counts[category] > 0,
  );
  // 갈래가 하나뿐이면 토글은 전체와 같은 화면을 두 번 보여줄 뿐이다.
  if (available.length < 2) return null;

  return (
    <div
      role="group"
      aria-label={t("detailPage.brandAssets.filterLabel")}
      className="mb-2 flex flex-wrap gap-1"
    >
      <FilterChip
        label={t("detailPage.brandAssets.filterAll")}
        count={total}
        active={value === "all"}
        onClick={() => onChange("all")}
      />
      {available.map((category) => (
        <FilterChip
          key={category}
          label={t(BRAND_IMAGE_CATEGORY_LABEL_KEY[category])}
          count={counts[category]}
          active={value === category}
          onClick={() => onChange(category)}
        />
      ))}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-dpe-lg border px-2 py-0.5 text-[11px] font-dpe-medium transition " +
        (active
          ? "border-dpe-ink-800 bg-dpe-ink-800 text-dpe-on-accent"
          : "border-dpe-ink-200 text-dpe-ink-500 hover:border-dpe-ink-400 hover:text-dpe-ink-700")
      }
    >
      {label}
      <span className="ml-1 font-dpe-normal opacity-60">{count}</span>
    </button>
  );
}

/**
 * 썸네일 한 칸.
 *
 * 높이를 ``img`` 가 아니라 **칸이** 잡는다. 사진은 뒤늦게(``loading="lazy"``) 도착
 * 하는데 높이가 사진에 매달려 있으면 도착 전까지 칸이 납작하게 눌린다. 눌린 칸은
 * 보기 나쁜 데서 끝나지 않는다 — 열두 장이 한 줌으로 접히면 바닥의 감시자가 계속
 * 화면에 남아 다음 열두 장을 부르고, 그게 끝까지 이어져 결국 전부를 한꺼번에
 * 불러온다. 스크롤한 만큼만 그리자는 얘기가 바로 여기서 무너진다.
 */
function BrandImageCard({
  asset,
  store,
  onDelete,
}: {
  asset: BrandAsset;
  store: unknown;
  onDelete: () => void;
}) {
  const { brand } = useDetailPageHost();
  const { t } = useTranslation("branding");

  return (
    <div
      data-dpe-part="asset-card"
      className="group relative overflow-hidden rounded-dpe-md border border-dpe-ink-200 hover:border-dpe-ink-500"
    >
      <button
        type="button"
        disabled={!asset.download_url}
        onClick={() =>
          // presigned URL(download_url)은 15분이면 죽는다. 문서에 남는 주소는
          // 만료 없는 경로여야 다시 열 때 403이 안 난다.
          asset.download_url &&
          insertPersonalImage(store, brand.brandAssetDocumentSrc(asset))
        }
        className="block h-24 w-full bg-dpe-ink-100 disabled:opacity-50"
        title={t("detailPage.brandAssets.insertHint")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.download_url ?? ""}
          crossOrigin="anonymous"
          loading="lazy"
          decoding="async"
          alt={asset.display_name ?? asset.filename}
          className="h-full w-full object-cover transition group-hover:opacity-90"
        />
      </button>
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-dpe-sm bg-dpe-scrim/70 px-1.5 py-0.5 text-[10px] text-dpe-on-accent">
        {asset.display_name ?? asset.filename}
      </span>
      <button
        type="button"
        onClick={onDelete}
        className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-dpe-md bg-dpe-surface/95 text-dpe-ink-400 shadow-sm hover:text-dpe-danger-600 group-hover:flex"
        aria-label={t("detailPage.brandAssets.delete")}
      >
        <Trash2 aria-hidden="true" size={13} />
      </button>
    </div>
  );
}

/**
 * 브랜드 자산 갈래. 안에서 다시 제품 · 모델 · 직접 생성 · 기타로 나눈다 —
 * 무엇을 근거로 가르는지는 `lib/detail-page/brand-image-category.ts` 에 적혀 있다.
 *
 * 그리는 몫은 갈래 전체에 걸린 한 예산이고, 갈래를 갈아타면 예산도 처음으로
 * 돌아간다. 나눠 놓고 여전히 200장을 굽는다면 나눈 값이 없다.
 */
function BrandAssetGallery({ store }: { store: unknown }) {
  const { brand, queryKeys, toast } = useDetailPageHost();
  const { t } = useTranslation("branding");
  const queryClient = useQueryClient();
  const {
    activeBrand,
    activeBrandId,
    isLoading: brandsLoading,
  } = brand.useBrandWorkspace();
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<BrandImageCategory | "all">("all");
  const fileRef = useRef<HTMLInputElement>(null);
  // GIF는 '브랜드 GIF' 패널이 맡는다 — 사진과 한 그리드에 섞이면 고르기 어렵다.
  const assetsQuery = useQuery({
    queryKey: queryKeys.branding.brandAssets(activeBrandId, "image"),
    queryFn: ({ signal }) => brand.listBrandAssets(activeBrandId!, signal, "image"),
    enabled: Boolean(activeBrandId),
    staleTime: 4 * 60_000,
  });
  const items = useMemo(
    () => (assetsQuery.data ?? []).filter(isImageAsset),
    [assetsQuery.data],
  );
  const counts = useMemo(() => countBrandImages(items), [items]);
  const sections = useMemo(() => groupBrandImages(items), [items]);
  const shown = useMemo(
    () =>
      category === "all"
        ? sections
        : sections.filter((section) => section.category === category),
    [sections, category],
  );
  const shownTotal = shown.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  // 브랜드를 옮기거나 갈래를 갈아타면 다시 처음부터 센다 — 200장을 보고 온 사람이
  // 다른 갈래로 옮겨도 200장을 그대로 요청하면 서랍을 나눈 값이 사라진다.
  const reveal = useProgressiveReveal(shownTotal, {
    resetKey: `${activeBrandId ?? ""}:${category}`,
  });
  const revealed = takeBrandImages(shown, reveal.visible);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!activeBrandId) throw new Error("brand-not-selected");
      return brand.uploadBrandAsset(activeBrandId, file, uploadKind(file), {
        metadata: { source: "canvas_upload" },
      });
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.branding.brandAssets(activeBrandId),
      });
    },
    onError: () => setError(t("detailPage.brandAssets.uploadFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (asset: BrandAsset) => brand.deleteBrandAsset(asset),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.branding.brandAssets(activeBrandId),
      });
    },
    onError: () => toast.error(t("detailPage.brandAssets.deleteFailed")),
  });

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(t("detailPage.brandAssets.uploadTooLarge"));
      return;
    }
    uploadMutation.mutate(file);
  };

  return (
    <div className="flex h-full flex-col p-4">
      <BrandPanelHeader onRefresh={() => void assetsQuery.refetch()} />

      <label className="mb-3 flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-dpe-md border border-dashed border-dpe-ink-300 text-dpe-ink-400 hover:border-dpe-ink-400 hover:text-dpe-ink-600">
        {uploadMutation.isPending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />
        ) : (
          <Upload aria-hidden="true" size={18} />
        )}
        <span className="text-[11px]">
          {t("detailPage.brandAssets.uploadImage")}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          className="hidden"
          onChange={handleUpload}
        />
      </label>

      {brandsLoading || assetsQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-dpe-ink-400">
          <Loader2 aria-hidden="true" className="animate-spin" size={22} />
        </div>
      ) : error || assetsQuery.error ? (
        <p className="text-xs font-dpe-medium text-dpe-danger-600">
          {error ?? t("detailPage.brandAssets.loadFailed")}
        </p>
      ) : !activeBrand ? (
        <p className="text-xs text-dpe-ink-400">
          {t("detailPage.brandAssets.noBrand")}
        </p>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-dpe-ink-400">
          <ImageOff aria-hidden="true" size={22} />
          <p className="text-xs">{t("detailPage.brandAssets.imagesEmpty")}</p>
          <Link
            href="/branding/moodboard"
            className="inline-flex items-center gap-1 text-[11px] font-dpe-medium text-dpe-ink-600 underline underline-offset-2"
          >
            {t("detailPage.brandAssets.openMoodboard")}
            <ExternalLink size={11} />
          </Link>
        </div>
      ) : (
        <>
          <CategoryFilter
            counts={counts}
            total={items.length}
            value={category}
            onChange={setCategory}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {revealed.map((section) => (
              <section key={section.category} className="mb-4 last:mb-0">
                {/* 갈래를 하나만 볼 때는 제목이 토글과 같은 말을 두 번 한다. */}
                {category === "all" && (
                  <h3 className="mb-1.5 text-[11px] font-dpe-semibold text-dpe-ink-500">
                    {t(BRAND_IMAGE_CATEGORY_LABEL_KEY[section.category])}
                    <span className="ml-1 font-dpe-normal text-dpe-ink-300">
                      {counts[section.category]}
                    </span>
                  </h3>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {section.items.map((asset) => (
                    <BrandImageCard
                      key={asset.id}
                      asset={asset}
                      store={store}
                      onDelete={() => deleteMutation.mutate(asset)}
                    />
                  ))}
                </div>
              </section>
            ))}
            {reveal.hasMore && (
              <div
                ref={reveal.sentinelRef}
                data-testid="brand-assets-sentinel"
                className="flex h-10 items-center justify-center text-dpe-ink-300"
              >
                <Loader2 aria-hidden="true" className="animate-spin" size={16} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
