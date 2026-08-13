"use client";

import { useRef, useState, type ChangeEvent } from "react";
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
      <div className="flex gap-1 border-b border-neutral-200 px-4 pt-3">
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
        "-mb-px border-b-2 px-2.5 pb-2 text-[11px] font-medium " +
        (active
          ? "border-neutral-800 text-neutral-800"
          : "border-transparent text-neutral-400 hover:text-neutral-600")
      }
    >
      {label}
    </button>
  );
}

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
  const fileRef = useRef<HTMLInputElement>(null);
  // GIF는 '브랜드 GIF' 패널이 맡는다 — 사진과 한 그리드에 섞이면 고르기 어렵다.
  const assetsQuery = useQuery({
    queryKey: queryKeys.branding.brandAssets(activeBrandId, "image"),
    queryFn: ({ signal }) => brand.listBrandAssets(activeBrandId!, signal, "image"),
    enabled: Boolean(activeBrandId),
    staleTime: 4 * 60_000,
  });
  const items = (assetsQuery.data ?? []).filter(isImageAsset);
  // 브랜드를 옮기면 다시 처음부터 센다.
  const reveal = useProgressiveReveal(items.length, { resetKey: activeBrandId });

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

      <label className="mb-3 flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-neutral-300 text-neutral-400 hover:border-neutral-400 hover:text-neutral-600">
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
        <div className="flex flex-1 items-center justify-center text-neutral-400">
          <Loader2 aria-hidden="true" className="animate-spin" size={22} />
        </div>
      ) : error || assetsQuery.error ? (
        <p className="text-xs font-medium text-red-600">
          {error ?? t("detailPage.brandAssets.loadFailed")}
        </p>
      ) : !activeBrand ? (
        <p className="text-xs text-neutral-400">
          {t("detailPage.brandAssets.noBrand")}
        </p>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-neutral-400">
          <ImageOff aria-hidden="true" size={22} />
          <p className="text-xs">{t("detailPage.brandAssets.imagesEmpty")}</p>
          <Link
            href="/branding/moodboard"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-600 underline underline-offset-2"
          >
            {t("detailPage.brandAssets.openMoodboard")}
            <ExternalLink size={11} />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 overflow-y-auto">
          {items.slice(0, reveal.visible).map((asset) => (
            <div
              key={asset.id}
              className="group relative overflow-hidden rounded-md border border-neutral-200 hover:border-neutral-500"
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
                className="block w-full disabled:opacity-50"
                title={t("detailPage.brandAssets.insertHint")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.download_url ?? ""}
                  crossOrigin="anonymous"
                  loading="lazy"
                  decoding="async"
                  alt={asset.display_name ?? asset.filename}
                  className="h-24 w-full object-cover transition group-hover:opacity-90"
                />
              </button>
              <span className="pointer-events-none absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                {asset.display_name ?? asset.filename}
              </span>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(asset)}
                className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-md bg-white/95 text-neutral-400 shadow-sm hover:text-red-600 group-hover:flex"
                aria-label={t("detailPage.brandAssets.delete")}
              >
                <Trash2 aria-hidden="true" size={13} />
              </button>
            </div>
          ))}
          {reveal.hasMore && (
            <div
              ref={reveal.sentinelRef}
              data-testid="brand-assets-sentinel"
              className="col-span-2 flex h-10 items-center justify-center text-neutral-300"
            >
              <Loader2 aria-hidden="true" className="animate-spin" size={16} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
