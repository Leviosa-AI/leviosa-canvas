"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, ImageOff, Loader2 } from "lucide-react";

import { BrandPanelHeader } from "./detail-page-brand-panel-header";
import { useDetailPageHost } from "./detail-page-host-context";
import type { DetailPageBrandReferenceItem } from "./detail-page-host-context";

/**
 * 내 레퍼런스 — 저작한 상세페이지를 브랜드 버킷에 넣고, 다음 상품에서 다시 꺼내 쓴다.
 *
 * 공들여 만든 페이지는 다음 상품에서 참고하고 싶은 **자기 레퍼런스**다. 그런데 편집기를
 * 닫으면 그 화면은 그 인스턴스 안에만 남아서, 다음 상품을 만들 때 다시 찾아 열어야
 * 보인다. 여기 저장해 두면 브랜드 자산으로 남아 어느 상세페이지에서든 꺼내 쓸 수 있다.
 *
 * ## 화면 캡쳐와 편집기 문서를 함께 저장한다
 *
 * 서버가 화면별 PNG 와 편집기 문서(JSON) 둘 다 넣는다. 캡쳐만 남기면 "이런 느낌"까지만
 * 되돌릴 수 있고 좌표·슬롯·폰트는 사라진다 — 그건 템플릿화가 아니라 스크린샷 모으기다.
 * 다만 **여기 목록에 거는 것은 캡쳐(role=screen)뿐이다.** 문서는 그림이 아니라서 걸면
 * 깨진 썸네일이 된다.
 *
 * ## 왜 저장이 렌더를 요구하는가
 *
 * 서버는 화면 그림을 새로 굽지 않고 저장·렌더가 만들어 둔 것을 옮긴다 — 셀러가 마지막으로
 * 본 화면과 같은 그림이어야 하기 때문이다. 그래서 한 번도 저장하지 않은 문서는 409 로
 * 돌아온다. 그 경우 "먼저 저장하세요"라고 말해 준다.
 */

const REFERENCES_QUERY_ROOT = "detail-page-brand-references";

export function DetailPageReferencesPanel({
  generatedId,
}: {
  /** 지금 편집 중인 상세페이지. 없으면 저장 버튼 없이 목록만 보여 준다. */
  generatedId?: string;
}) {
  const { api, brand, toast } = useDetailPageHost();
  const queryClient = useQueryClient();
  const { activeBrand, activeBrandId, isLoading: brandsLoading } = brand.useBrandWorkspace();
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: [REFERENCES_QUERY_ROOT, activeBrandId],
    queryFn: ({ signal }) =>
      api.listDetailPageBrandReferences({ brand_id: activeBrandId! }, signal),
    enabled: Boolean(activeBrandId),
    staleTime: 60_000,
  });

  /** 한 상세페이지에서 나온 캡쳐를 묶어 보여 준다 — 낱장으로 흩어 두면 무엇의 몇 번째 화면인지 모른다. */
  const groups = useMemo(() => {
    const screens = (listQuery.data?.items ?? []).filter(
      (item) => item.role === "screen",
    );
    const byGroup = new Map<string, DetailPageBrandReferenceItem[]>();
    for (const item of screens) {
      const key = item.reference_group || item.asset_id;
      byGroup.set(key, [...(byGroup.get(key) ?? []), item]);
    }
    return [...byGroup.entries()].map(([key, items]) => ({
      key,
      name: items[0]?.reference_name || "상세페이지",
      items: [...items].sort((a, b) => a.screen_index - b.screen_index),
    }));
  }, [listQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!generatedId) throw new Error("no-instance");
      if (!activeBrandId) throw new Error("brand-not-selected");
      return api.saveDetailPageAsBrandReference(generatedId, { brand_id: activeBrandId });
    },
    onSuccess: async (result) => {
      setError(null);
      const screens = result.assets.filter((asset) => asset.role === "screen").length;
      toast.success(`레퍼런스로 저장했어요 (화면 ${screens}장).`);
      await queryClient.invalidateQueries({
        queryKey: [REFERENCES_QUERY_ROOT, activeBrandId],
      });
    },
    onError: (err) => {
      setError(
        err instanceof Error && err.message !== "no-instance"
          ? err.message
          : "레퍼런스로 저장하지 못했어요.",
      );
    },
  });

  return (
    <div className="flex h-full flex-col p-4">
      <BrandPanelHeader onRefresh={() => void listQuery.refetch()} />

      {generatedId ? (
        <button
          type="button"
          disabled={!activeBrandId || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="mb-3 flex h-16 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-neutral-300 text-neutral-400 transition-colors hover:border-neutral-400 hover:text-neutral-600 disabled:opacity-40"
        >
          {saveMutation.isPending ? (
            <Loader2 aria-hidden="true" className="animate-spin" size={18} />
          ) : (
            <BookmarkPlus aria-hidden="true" size={18} />
          )}
          <span className="text-[11px]">이 상세페이지를 레퍼런스로 저장</span>
        </button>
      ) : null}

      {error ? (
        <p className="mb-2 text-xs font-medium text-red-600">{error}</p>
      ) : null}

      {brandsLoading || listQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-neutral-400">
          <Loader2 aria-hidden="true" className="animate-spin" size={22} />
        </div>
      ) : !activeBrand ? (
        <p className="text-xs text-neutral-400">브랜드를 먼저 골라 주세요.</p>
      ) : listQuery.error ? (
        <p className="text-xs font-medium text-red-600">
          레퍼런스를 불러오지 못했어요.
        </p>
      ) : groups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-neutral-400">
          <ImageOff aria-hidden="true" size={22} />
          <p className="text-xs">
            아직 저장한 레퍼런스가 없어요. 마음에 드는 상세페이지를 저장해 두면 다음
            상품에서 바로 참고할 수 있어요.
          </p>
        </div>
      ) : (
        <div className="space-y-4 overflow-y-auto">
          {groups.map((group) => (
            <section key={group.key}>
              <h3 className="mb-1.5 truncate text-[11px] font-medium text-neutral-600">
                {group.name}
                <span className="ml-1 text-neutral-400">{group.items.length}장</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => (
                  <figure
                    key={item.asset_id}
                    className="overflow-hidden rounded-md border border-neutral-200"
                    title={item.screen_label || item.display_name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      crossOrigin="anonymous"
                      alt={item.display_name}
                      className="h-24 w-full object-cover object-top"
                    />
                  </figure>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
