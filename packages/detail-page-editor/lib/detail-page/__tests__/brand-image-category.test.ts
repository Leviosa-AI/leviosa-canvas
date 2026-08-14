import { describe, expect, it } from "vitest";

import type { BrandAsset } from "../../../components/detail-page/detail-page-host-context";
import {
  brandImageCategory,
  countBrandImages,
  groupBrandImages,
  takeBrandImages,
} from "../brand-image-category";

function asset(patch: Partial<BrandAsset> & { id: string }): BrandAsset {
  return {
    brand_id: "brand-1",
    asset_type: "image",
    status: "active",
    filename: `${patch.id}.jpg`,
    display_name: null,
    content_type: "image/jpeg",
    size_bytes: 1,
    s3_key: `brand-1/${patch.id}.jpg`,
    s3_etag: null,
    s3_version_id: null,
    download_url: `https://s3/${patch.id}.jpg`,
    stable_path: `/api/v1/brands/assets/file/${patch.id}`,
    gif_kind: null,
    revision: 1,
    metadata: {},
    created_by: "seller-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...patch,
  } as BrandAsset;
}

describe("brandImageCategory", () => {
  it("올린 사람이 고른 분류를 먼저 믿는다", () => {
    expect(
      brandImageCategory(asset({ id: "a", asset_type: "product_image" })),
    ).toBe("product");
    expect(
      brandImageCategory(asset({ id: "b", asset_type: "model_image" })),
    ).toBe("model");
  });

  it("서버가 찍은 생성 흔적으로 '직접 생성'을 가른다", () => {
    expect(
      brandImageCategory(
        asset({ id: "c", metadata: { source: "canvas_generated" } }),
      ),
    ).toBe("generated");
  });

  it("굽는 자리가 늘어도 새 생성물이 기타로 새지 않는다", () => {
    // 목록을 손으로 따라 고치게 두면 다음 생성 경로가 조용히 '기타'로 간다.
    expect(
      brandImageCategory(
        asset({ id: "d", metadata: { source: "detail_page_generated" } }),
      ),
    ).toBe("generated");
  });

  it("셀러가 올린 사진은 생성물이 아니다", () => {
    expect(
      brandImageCategory(
        asset({ id: "e", metadata: { source: "canvas_upload" } }),
      ),
    ).toBe("other");
    expect(brandImageCategory(asset({ id: "f", asset_type: "logo" }))).toBe(
      "other",
    );
  });

  it("생성한 제품 컷은 제품 자리에서 찾을 수 있어야 한다", () => {
    // 분류가 둘 다 붙어 있으면 셀러가 직접 고른 쪽을 따른다.
    expect(
      brandImageCategory(
        asset({
          id: "g",
          asset_type: "product_image",
          metadata: { source: "canvas_generated" },
        }),
      ),
    ).toBe("product");
  });
});

describe("groupBrandImages", () => {
  const items = [
    asset({ id: "p1", asset_type: "product_image" }),
    asset({ id: "o1" }),
    asset({ id: "m1", asset_type: "model_image" }),
    asset({ id: "g1", metadata: { source: "canvas_generated" } }),
    asset({ id: "p2", asset_type: "product_image" }),
  ];

  it("셀러가 부르는 순서대로 내고, 빈 갈래는 내지 않는다", () => {
    const sections = groupBrandImages([
      asset({ id: "o1" }),
      asset({ id: "m1", asset_type: "model_image" }),
    ]);
    expect(sections.map((section) => section.category)).toEqual([
      "model",
      "other",
    ]);
  });

  it("네 갈래를 순서대로 묶는다", () => {
    expect(groupBrandImages(items).map((section) => section.category)).toEqual([
      "product",
      "model",
      "generated",
      "other",
    ]);
  });

  it("갈래별 장수는 거르기 전 전체를 센다", () => {
    expect(countBrandImages(items)).toEqual({
      product: 2,
      model: 1,
      generated: 1,
      other: 1,
    });
  });
});

describe("takeBrandImages", () => {
  const sections = groupBrandImages([
    asset({ id: "p1", asset_type: "product_image" }),
    asset({ id: "p2", asset_type: "product_image" }),
    asset({ id: "m1", asset_type: "model_image" }),
    asset({ id: "m2", asset_type: "model_image" }),
  ]);

  it("그릴 몫은 구획별이 아니라 패널 전체 예산이다", () => {
    // 구획마다 따로 세면 갈래가 넷일 때 첫 화면에 네 배가 깔린다.
    const taken = takeBrandImages(sections, 3);
    expect(taken.map((section) => section.items.map((item) => item.id))).toEqual(
      [["p1", "p2"], ["m1"]],
    );
  });

  it("예산이 남으면 통째로 낸다", () => {
    expect(
      takeBrandImages(sections, 99).flatMap((section) =>
        section.items.map((item) => item.id),
      ),
    ).toEqual(["p1", "p2", "m1", "m2"]);
  });

  it("예산이 0이면 빈 구획을 남기지 않는다", () => {
    expect(takeBrandImages(sections, 0)).toEqual([]);
  });
});
