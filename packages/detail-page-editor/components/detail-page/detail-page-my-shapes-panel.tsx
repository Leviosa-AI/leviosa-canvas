"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Shapes, Trash2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BrandPanelHeader } from "./detail-page-brand-panel-header";
import { useDetailPageHost } from "./detail-page-host-context";
import type { BrandAsset } from "./detail-page-host-context";
import { insertShape } from "../../lib/detail-page/insert-shape";

const MAX_UPLOAD_BYTES = 500_000;

function isShape(asset: BrandAsset): boolean {
  return asset.asset_type === "shape" || asset.asset_type === "svg";
}

export function DetailPageMyShapesPanel({ store }: { store: unknown }) {
  const { brand, queryKeys, toast } = useDetailPageHost();
  const { t } = useTranslation("branding");
  const queryClient = useQueryClient();
  const {
    activeBrand,
    activeBrandId,
    isLoading: brandsLoading,
  } = brand.useBrandWorkspace();
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const assetsQuery = useQuery({
    queryKey: queryKeys.branding.brandAssets(activeBrandId),
    queryFn: ({ signal }) => brand.listBrandAssets(activeBrandId!, signal),
    enabled: Boolean(activeBrandId),
    staleTime: 4 * 60_000,
  });
  const items = (assetsQuery.data ?? []).filter(isShape);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.branding.brandAssets(activeBrandId),
    });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!activeBrandId) throw new Error("brand-not-selected");
      return brand.uploadBrandAsset(activeBrandId, file, "shape", {
        metadata: { source: "canvas_upload" },
      });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(t("detailPage.brandAssets.shapeUploaded"));
    },
    onError: () => toast.error(t("detailPage.brandAssets.uploadFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (asset: BrandAsset) => brand.deleteBrandAsset(asset),
    onSuccess: invalidate,
    onError: () => toast.error(t("detailPage.brandAssets.deleteFailed")),
  });

  const insert = async (asset: BrandAsset) => {
    if (!asset.download_url) return;
    setInsertingId(asset.id);
    try {
      const response = await fetch(asset.download_url);
      if (!response.ok) throw new Error("download failed");
      const svg = await response.text();
      insertShape(
        store,
        svg,
        typeof asset.metadata.view_box === "string"
          ? asset.metadata.view_box
          : undefined,
      );
    } catch {
      toast.error(t("detailPage.brandAssets.shapeLoadFailed"));
    } finally {
      setInsertingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col p-4">
      <BrandPanelHeader onRefresh={() => void assetsQuery.refetch()} />

      <label className="mb-3 flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-le-md border border-dashed border-le-ink-300 text-le-ink-400 hover:border-le-ink-400 hover:text-le-ink-600">
        {uploadMutation.isPending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />
        ) : (
          <Upload aria-hidden="true" size={18} />
        )}
        <span className="text-[11px]">
          {t("detailPage.brandAssets.uploadShape")}
        </span>
        <input
          type="file"
          accept=".svg,image/svg+xml"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (
              file.size > MAX_UPLOAD_BYTES ||
              (!file.name.toLowerCase().endsWith(".svg") &&
                file.type !== "image/svg+xml")
            ) {
              toast.error(t("detailPage.brandAssets.invalidShape"));
              return;
            }
            uploadMutation.mutate(file);
          }}
        />
      </label>

      {brandsLoading || assetsQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-le-ink-400">
          <Loader2 aria-hidden="true" className="animate-spin" size={22} />
        </div>
      ) : assetsQuery.error ? (
        <p className="text-xs font-le-medium text-le-danger-600">
          {t("detailPage.brandAssets.loadFailed")}
        </p>
      ) : !activeBrand ? (
        <p className="text-xs text-le-ink-400">
          {t("detailPage.brandAssets.noBrand")}
        </p>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-le-ink-400">
          <Shapes aria-hidden="true" size={22} />
          <p className="text-xs">{t("detailPage.brandAssets.shapesEmpty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 overflow-y-auto">
          {items.map((asset) => (
            <div
              key={asset.id}
              className="group relative aspect-square rounded-le-md border border-le-ink-200 hover:border-le-ink-500"
            >
              <button
                type="button"
                onClick={() => void insert(asset)}
                disabled={!asset.download_url || insertingId === asset.id}
                className="flex h-full w-full items-center justify-center p-2 disabled:opacity-50"
                title={t("detailPage.brandAssets.insertHint")}
              >
                {insertingId === asset.id ? (
                  <Loader2 className="animate-spin text-le-ink-400" size={18} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.download_url ?? ""}
                    crossOrigin="anonymous"
                    alt={asset.display_name ?? asset.filename}
                    className="max-h-full max-w-full object-contain"
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(asset)}
                className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-le-md bg-le-surface/95 text-le-ink-400 shadow-sm hover:text-le-danger-600 group-hover:flex"
                aria-label={t("detailPage.brandAssets.delete")}
              >
                <Trash2 aria-hidden="true" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
