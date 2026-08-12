"use client";

// 브랜드 GIF 패널 — 브랜드 이미지에서 GIF만 떼어내 만든 경로별로 나눠 보여준다.
//
// 사진과 GIF가 한 그리드에 섞여 있으면 고르기 어렵다(썸네일만으로는 구분도 안 된다).
// 목록은 서버가 ``media=gif``로 걸러 주고, 각 항목의 구획(``gif_kind``)도 서버가
// 붙여 준다 — 결과 GIF 바이트만 봐서는 텍스트에서 구웠는지 도형에서 구웠는지 알 수
// 없기 때문에, 만든 시점의 태그가 유일한 근거다.
//
// 분류가 없는 GIF(유저가 직접 올린 것 등)는 '기타'로 모은다. 4구획 중 하나로
// 억지로 밀어 넣으면 없는 사실을 만드는 셈이고, 빼 버리면 올린 GIF가 사라진다.

import { useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Loader2, Trash2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BrandPanelHeader } from "./detail-page-brand-panel-header";
import { useDetailPageHost } from "./detail-page-host-context";
import type {
  BrandAsset,
  BrandAssetGifKind,
} from "./detail-page-host-context";
import { insertPersonalImage } from "../../lib/detail-page/insert-image";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** 구획 순서 = 화면 순서. 텍스트 → 이미지(이펙트/프롬프트) → 도형. */
const SECTIONS: Array<{
  kind: BrandAssetGifKind;
  labelKey: string;
  fallback: string;
}> = [
  {
    kind: "text",
    labelKey: "detailPage.brandGifs.sectionText",
    fallback: "텍스트 GIF",
  },
  {
    kind: "image_effect",
    labelKey: "detailPage.brandGifs.sectionImageEffect",
    fallback: "이미지 GIF (이펙트)",
  },
  {
    kind: "image_prompt",
    labelKey: "detailPage.brandGifs.sectionImagePrompt",
    fallback: "이미지 GIF (프롬프트)",
  },
  {
    kind: "shape",
    labelKey: "detailPage.brandGifs.sectionShape",
    fallback: "도형 GIF",
  },
];

/**
 * GIF들을 화면 구획으로 나눈다. 분류가 없는 것은 마지막 '기타' 묶음으로 간다.
 *
 * 반환은 **비어 있지 않은 구획만** — 빈 제목만 네 줄 떠 있으면 패널이 고장 난 것처럼
 * 보인다.
 */
export function groupBrandGifs(assets: BrandAsset[]): Array<{
  kind: BrandAssetGifKind | "other";
  items: BrandAsset[];
}> {
  const buckets = new Map<BrandAssetGifKind | "other", BrandAsset[]>();
  for (const asset of assets) {
    const key = asset.gif_kind ?? "other";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(asset);
    else buckets.set(key, [asset]);
  }
  const ordered: Array<BrandAssetGifKind | "other"> = [
    ...SECTIONS.map((section) => section.kind),
    "other",
  ];
  return ordered
    .map((kind) => ({ kind, items: buckets.get(kind) ?? [] }))
    .filter((section) => section.items.length > 0);
}

export function DetailPageBrandGifsPanel({ store }: { store: unknown }) {
  const { brand, queryKeys, toast } = useDetailPageHost();
  const { t } = useTranslation("branding");
  const queryClient = useQueryClient();
  const {
    activeBrand,
    activeBrandId,
    isLoading: brandsLoading,
  } = brand.useBrandWorkspace();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const gifsQuery = useQuery({
    queryKey: queryKeys.branding.brandAssets(activeBrandId, "gif"),
    queryFn: ({ signal }) => brand.listBrandAssets(activeBrandId!, signal, "gif"),
    enabled: Boolean(activeBrandId),
    staleTime: 4 * 60_000,
  });
  const sections = groupBrandGifs(gifsQuery.data ?? []);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.branding.brandAssets(activeBrandId),
    });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!activeBrandId) throw new Error("brand-not-selected");
      return brand.uploadBrandAsset(activeBrandId, file, "gif", {
        metadata: { source: "canvas_upload" },
      });
    },
    onSuccess: async () => {
      setError(null);
      await invalidate();
    },
    onError: () => setError(t("detailPage.brandAssets.uploadFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (asset: BrandAsset) => brand.deleteBrandAsset(asset),
    onSuccess: invalidate,
    onError: () => toast.error(t("detailPage.brandAssets.deleteFailed")),
  });

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "image/gif") {
      setError(
        t("detailPage.brandGifs.notAGif", {
          defaultValue: "GIF 파일만 올릴 수 있어요.",
        }),
      );
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(t("detailPage.brandAssets.uploadTooLarge"));
      return;
    }
    uploadMutation.mutate(file);
  };

  return (
    <div className="flex h-full flex-col p-4">
      <BrandPanelHeader onRefresh={() => void gifsQuery.refetch()} />

      <label className="mb-3 flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-neutral-300 text-neutral-400 hover:border-neutral-400 hover:text-neutral-600">
        {uploadMutation.isPending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />
        ) : (
          <Upload aria-hidden="true" size={18} />
        )}
        <span className="text-[11px]">
          {t("detailPage.brandGifs.upload", { defaultValue: "GIF 올리기" })}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/gif"
          className="hidden"
          onChange={handleUpload}
        />
      </label>

      {brandsLoading || gifsQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-neutral-400">
          <Loader2 aria-hidden="true" className="animate-spin" size={22} />
        </div>
      ) : error || gifsQuery.error ? (
        <p className="text-xs font-medium text-red-600">
          {error ?? t("detailPage.brandAssets.loadFailed")}
        </p>
      ) : !activeBrand ? (
        <p className="text-xs text-neutral-400">
          {t("detailPage.brandAssets.noBrand")}
        </p>
      ) : sections.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-neutral-400">
          <Film aria-hidden="true" size={22} />
          <p className="text-xs">
            {t("detailPage.brandGifs.empty", {
              defaultValue:
                "아직 GIF가 없어요. 텍스트·이미지·도형을 골라 GIF로 만들어 보세요.",
            })}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 overflow-y-auto">
          {sections.map((section) => (
            <section key={section.kind}>
              <h3 className="mb-1.5 text-[11px] font-semibold text-neutral-500">
                {section.kind === "other"
                  ? t("detailPage.brandGifs.sectionOther", {
                      defaultValue: "기타",
                    })
                  : t(
                      SECTIONS.find((entry) => entry.kind === section.kind)!
                        .labelKey,
                      {
                        defaultValue: SECTIONS.find(
                          (entry) => entry.kind === section.kind,
                        )!.fallback,
                      },
                    )}
                <span className="ml-1 font-normal text-neutral-300">
                  {section.items.length}
                </span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {section.items.map((asset) => (
                  <div
                    key={asset.id}
                    className="group relative overflow-hidden rounded-md border border-neutral-200 hover:border-neutral-500"
                  >
                    <button
                      type="button"
                      disabled={!asset.download_url}
                      onClick={() =>
                        // 문서에 박히는 주소는 만료 없는 경로여야 한다 — presigned를
                        // 박으면 저장하고 몇 분 뒤 다시 열 때 403으로 깨진다.
                        asset.download_url &&
                        insertPersonalImage(store, brand.brandAssetDocumentSrc(asset), {
                          isGif: true,
                        })
                      }
                      className="block w-full disabled:opacity-50"
                      title={t("detailPage.brandAssets.insertHint")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.download_url ?? ""}
                        crossOrigin="anonymous"
                        alt={asset.display_name ?? asset.filename}
                        className="h-24 w-full object-cover transition group-hover:opacity-90"
                      />
                    </button>
                    <span className="pointer-events-none absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                      {String(asset.metadata?.effect ?? "") ||
                        (asset.display_name ?? asset.filename)}
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
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
