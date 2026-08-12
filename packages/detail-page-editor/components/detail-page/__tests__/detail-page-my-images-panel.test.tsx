import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockList = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();

vi.mock("../../../lib/detail-page/insert-image", () => ({
  insertPersonalImage: (...args: unknown[]) => mockInsert(...args),
}));

import { DetailPageMyImagesPanel } from "../detail-page-my-images-panel";
import { renderWithDetailPageHost } from "./host-stub";

const brandWorkspace = () => ({
  brands: [
    { id: "brand-1", name: "levi&osa", ownedCompanyId: "company-1", revision: 1 },
  ],
  activeBrand: {
    id: "brand-1",
    name: "levi&osa",
    ownedCompanyId: "company-1",
    revision: 1,
  },
  activeBrandId: "brand-1",
  setActiveBrandId: vi.fn(),
  isLoading: false,
  error: null,
});

const BRAND = {
  listBrandAssets: (...args: unknown[]) => mockList(...args),
  deleteBrandAsset: (...args: unknown[]) => mockDelete(...args),
  // 실제 구현과 같은 규칙: 만료 없는 경로가 있으면 그걸, 없으면 presigned를 쓴다.
  brandAssetDocumentSrc: (asset: { stable_path?: string; download_url?: string | null }) =>
    asset.stable_path || asset.download_url || "",
  useBrandWorkspace: brandWorkspace,
};


function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderWithDetailPageHost(
    <QueryClientProvider client={client}>
      <DetailPageMyImagesPanel store={{ pages: [] }} />
    </QueryClientProvider>,
    { brand: BRAND },
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("DetailPageMyImagesPanel", () => {
  it("선택 브랜드의 사진만 불러오고 썸네일을 CORS 안전하게 표시한다", async () => {
    // GIF는 서버가 media=image로 이미 걸러 준다 — 패널은 사진 유형만 추린다.
    mockList.mockResolvedValue([
      {
        id: "asset-1",
        brand_id: "brand-1",
        asset_type: "image",
        content_type: "image/jpeg",
        download_url: "https://s3/brand-1/product.jpg",
        display_name: "대표 제품",
        filename: "product.jpg",
      },
      {
        id: "asset-3",
        brand_id: "brand-1",
        asset_type: "font",
        content_type: "font/ttf",
        download_url: "https://s3/brand-1/font.ttf",
        display_name: "Brand Font",
        filename: "font.ttf",
      },
    ]);

    renderPanel();

    const images = await screen.findAllByRole("img");
    expect(images).toHaveLength(1);
    expect(mockList).toHaveBeenCalledWith(
      "brand-1",
      expect.any(AbortSignal),
      "image",
    );
    for (const image of images) {
      expect(image).toHaveAttribute("crossorigin", "anonymous");
    }
  });

  it("사진을 클릭하면 캔버스에 삽입한다", async () => {
    mockList.mockResolvedValue([
      {
        id: "asset-1",
        brand_id: "brand-1",
        asset_type: "image",
        content_type: "image/jpeg",
        download_url: "https://s3/brand-1/product.jpg",
        display_name: "대표 제품",
        filename: "product.jpg",
      },
    ]);
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: /대표 제품/ }),
    );

    expect(mockInsert).toHaveBeenCalledWith(
      { pages: [] },
      "https://s3/brand-1/product.jpg",
    );
  });

  it("문서에 박을 주소는 만료 없는 경로를 쓴다", async () => {
    // presigned URL을 문서에 저장하면 몇 분 뒤 다시 열 때 403으로 깨진다.
    mockList.mockResolvedValue([
      {
        id: "asset-1",
        brand_id: "brand-1",
        asset_type: "image",
        content_type: "image/jpeg",
        download_url: "https://s3/presigned.jpg",
        stable_path: "/api/v1/brands/assets/file/asset-1?sig=x",
        display_name: "대표 제품",
        filename: "product.jpg",
      },
    ]);
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /대표 제품/ }));

    expect(mockInsert).toHaveBeenCalledWith(
      { pages: [] },
      "/api/v1/brands/assets/file/asset-1?sig=x",
    );
  });

  it("카드마다 삭제 버튼을 둔다", async () => {
    mockList.mockResolvedValue([
      {
        id: "asset-1",
        brand_id: "brand-1",
        asset_type: "image",
        content_type: "image/jpeg",
        download_url: "https://s3/brand-1/product.jpg",
        display_name: "대표 제품",
        filename: "product.jpg",
        revision: 3,
      },
    ]);
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      await screen.findByRole("button", {
        name: "detailPage.brandAssets.delete",
      }),
    );

    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "asset-1", revision: 3 }),
    );
    // 삭제는 삽입과 겹치면 안 된다 — 카드를 클릭한 게 아니다.
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("GIF가 섞여 들어와도 사진 패널에는 띄우지 않는다", async () => {
    mockList.mockResolvedValue([
      {
        id: "asset-2",
        brand_id: "brand-1",
        asset_type: "gif",
        content_type: "image/gif",
        download_url: "https://s3/brand-1/motion.gif",
        display_name: "모션",
        filename: "motion.gif",
      },
    ]);

    renderPanel();

    expect(
      await screen.findByText("detailPage.brandAssets.imagesEmpty"),
    ).toBeTruthy();
  });
});
