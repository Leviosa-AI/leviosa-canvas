/**
 * 브랜드 사진을 셀러가 찾는 방식대로 갈래 짓는다 — 제품 · 모델 · 직접 생성 · 기타.
 *
 * 브랜드가 오래 살수록 이 서랍은 수백 장이 된다. 한 그리드에 통째로 쌓아 두면
 * "그때 그 모델 컷"을 찾는 일이 스크롤 노동이 된다. 다행히 근거는 이미 자산에 박혀
 * 있다 — 업로드할 때 고른 ``asset_type``(제품/모델)과, 서버가 생성물에 찍어 주는
 * ``metadata.source``.
 *
 * **썸네일 바이트만 봐서는 알 수 없는 것들이다.** 제품 사진과 모델 사진은 화면에서
 * 구분이 되지만 "내가 캔버스에서 구운 것"인지는 그림으로 드러나지 않는다. 그래서
 * 만든 시점에 찍힌 태그가 유일한 근거이고, 태그가 없으면 없는 사실을 만들지 않고
 * '기타'로 둔다.
 */

import type { BrandAsset } from "../../components/detail-page/detail-page-host-context";

export type BrandImageCategory = "product" | "model" | "generated" | "other";

/** 갈래 순서 = 화면 순서. 셀러가 부르는 순서대로 둔다. */
export const BRAND_IMAGE_CATEGORIES: readonly BrandImageCategory[] = [
  "product",
  "model",
  "generated",
  "other",
];

export const BRAND_IMAGE_CATEGORY_LABEL_KEY: Record<
  BrandImageCategory,
  string
> = {
  product: "detailPage.brandAssets.filterProduct",
  model: "detailPage.brandAssets.filterModel",
  generated: "detailPage.brandAssets.filterGenerated",
  other: "detailPage.brandAssets.filterOther",
};

/**
 * 캔버스·저작이 구워 브랜드 버킷에 바로 쓴 자산인가.
 *
 * 서버가 찍는 값은 지금 ``canvas_generated`` 하나지만, 굽는 자리가 늘 때마다 이
 * 목록을 따라 고치게 두면 새 생성물이 조용히 '기타'로 샌다. 접미사로 보는 이유다.
 * 셀러가 직접 올린 것(``canvas_upload``)은 여기 걸리지 않는다.
 */
function isGeneratedAsset(asset: BrandAsset): boolean {
  const source = asset.metadata?.source;
  return typeof source === "string" && source.endsWith("generated");
}

/**
 * 자산 하나의 갈래.
 *
 * ``asset_type`` 을 먼저 본다. 제품·모델은 올린 사람이 직접 고른 분류라 서버가
 * 나중에 찍는 흔적보다 셀러의 의도에 가깝다 — 생성한 제품 컷을 제품 자리에서 못
 * 찾으면 분류가 있으나 마나다.
 */
export function brandImageCategory(asset: BrandAsset): BrandImageCategory {
  if (asset.asset_type === "product_image") return "product";
  if (asset.asset_type === "model_image") return "model";
  if (isGeneratedAsset(asset)) return "generated";
  return "other";
}

export interface BrandImageSection {
  category: BrandImageCategory;
  items: BrandAsset[];
}

/**
 * 갈래별 장수. 토글에 붙는 숫자라 **거르기 전 전체**를 세야 한다 — 제품만 보는
 * 중에 모델 숫자가 0으로 바뀌면 숫자가 아니라 착시가 된다.
 */
export function countBrandImages(
  assets: BrandAsset[],
): Record<BrandImageCategory, number> {
  const counts: Record<BrandImageCategory, number> = {
    product: 0,
    model: 0,
    generated: 0,
    other: 0,
  };
  for (const asset of assets) counts[brandImageCategory(asset)] += 1;
  return counts;
}

/**
 * 화면 구획으로 나눈다. **비어 있지 않은 갈래만** — 빈 제목만 네 줄 떠 있으면
 * 패널이 고장 난 것처럼 보인다.
 */
export function groupBrandImages(assets: BrandAsset[]): BrandImageSection[] {
  const buckets = new Map<BrandImageCategory, BrandAsset[]>();
  for (const asset of assets) {
    const key = brandImageCategory(asset);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(asset);
    else buckets.set(key, [asset]);
  }
  return BRAND_IMAGE_CATEGORIES.map((category) => ({
    category,
    items: buckets.get(category) ?? [],
  })).filter((section) => section.items.length > 0);
}

/**
 * 앞에서부터 ``visible`` 장까지만 남긴다.
 *
 * 그릴 몫은 구획별이 아니라 **패널 전체 예산**이다. 구획마다 따로 세면 갈래가 넷일
 * 때 첫 화면에 48장이 깔린다 — 스크롤한 만큼만 그리자는 얘기가 무색해진다.
 */
export function takeBrandImages(
  sections: BrandImageSection[],
  visible: number,
): BrandImageSection[] {
  const taken: BrandImageSection[] = [];
  let left = Math.max(0, visible);
  for (const section of sections) {
    if (left <= 0) break;
    taken.push({ ...section, items: section.items.slice(0, left) });
    left -= Math.min(left, section.items.length);
  }
  return taken;
}
