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

  it("수백 장이 있어도 처음엔 한 화면 분량만 그린다", async () => {
    // 카드 하나가 곧 요청 하나다. 통째로 그리면 서랍을 여는 순간 그만큼이 한꺼번에
    // 나가고, 편집기가 정작 필요한 것(문서 이미지·폰트)이 그 뒤에 줄 선다.
    class FakeObserver {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    mockList.mockResolvedValue(
      Array.from({ length: 200 }, (_, index) => ({
        id: `asset-${index}`,
        brand_id: "brand-1",
        asset_type: "image",
        content_type: "image/jpeg",
        download_url: `https://s3/brand-1/${index}.jpg`,
        display_name: `사진 ${index}`,
        filename: `${index}.jpg`,
      })),
    );

    renderPanel();

    const images = await screen.findAllByRole("img");
    expect(images).toHaveLength(12);
    // 나머지는 바닥까지 스크롤해야 나온다 — 감시자가 그 자리를 지킨다.
    expect(screen.getByTestId("brand-assets-sentinel")).toBeInTheDocument();
    for (const image of images) {
      expect(image).toHaveAttribute("loading", "lazy");
    }
    vi.unstubAllGlobals();
  });

  it("갈래를 갈아타면 그 갈래만 남고 처음부터 다시 그린다", async () => {
    class FakeObserver {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    mockList.mockResolvedValue([
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `product-${index}`,
        brand_id: "brand-1",
        asset_type: "product_image",
        content_type: "image/jpeg",
        download_url: `https://s3/brand-1/product-${index}.jpg`,
        display_name: `제품 ${index}`,
        filename: `product-${index}.jpg`,
        metadata: {},
      })),
      {
        id: "model-0",
        brand_id: "brand-1",
        asset_type: "model_image",
        content_type: "image/jpeg",
        download_url: "https://s3/brand-1/model-0.jpg",
        display_name: "모델 0",
        filename: "model-0.jpg",
        metadata: {},
      },
    ]);
    const user = userEvent.setup();
    renderPanel();

    // 토글 숫자는 거르기 전 전체다 — 갈아타도 흔들리면 숫자가 아니라 착시가 된다.
    const modelChip = await screen.findByRole("button", {
      name: /detailPage\.brandAssets\.filterModel\s*1/,
    });
    // 스무 장이 있어도 첫 화면은 열두 장이다.
    expect(screen.getAllByRole("img")).toHaveLength(12);

    await user.click(modelChip);

    const images = await screen.findAllByRole("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("alt", "모델 0");
    // 갈래가 한 화면에 들어오면 더 부를 것이 없다.
    expect(screen.queryByTestId("brand-assets-sentinel")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("갈래가 하나뿐이면 토글을 내지 않는다", async () => {
    // 눌러 봐야 같은 화면인 칸은 고르는 일을 돕는 게 아니라 늘린다.
    mockList.mockResolvedValue([
      {
        id: "asset-1",
        brand_id: "brand-1",
        asset_type: "image",
        content_type: "image/jpeg",
        download_url: "https://s3/brand-1/product.jpg",
        display_name: "대표 제품",
        filename: "product.jpg",
        metadata: {},
      },
    ]);

    renderPanel();

    await screen.findAllByRole("img");
    expect(
      screen.queryByRole("group", {
        name: "detailPage.brandAssets.filterLabel",
      }),
    ).not.toBeInTheDocument();
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

// 저작 사진은 앱 도메인이라 슬롯으로 받는다. 두 갈래를 한 그리드에 안 섞는 이유는
// 고르는 방식이 달라서다 — 자산은 이름으로, 저작 사진은 "그때 그 상세페이지"로 찾는다.
describe("DetailPageMyImagesPanel 서랍 전환", () => {
  function renderWithAuthored(Panel: () => React.ReactElement) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return renderWithDetailPageHost(
      <QueryClientProvider client={client}>
        <DetailPageMyImagesPanel store={{ pages: [] }} />
      </QueryClientProvider>,
      { brand: BRAND, slots: { AuthoredImagesPanel: Panel } },
    );
  }

  it("브랜드 자산이 기본이고, 저작 갤러리로 갈아탈 수 있다", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue([]);
    const authored = vi.fn(() => <div>저작 갤러리</div>);

    renderWithAuthored(authored);

    // 기본은 브랜드 자산이다 — 업로드 자리가 그 갈래에만 있다.
    expect(
      await screen.findByText("detailPage.brandAssets.uploadImage"),
    ).toBeInTheDocument();
    // 서랍을 열기만 해도 수백 장짜리 목록을 서명해 오면 편집기가 열릴 때마다 그 값을 문다.
    expect(authored).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "detailPage.brandAssets.sourceAuthored" }),
    );

    expect(await screen.findByText("저작 갤러리")).toBeInTheDocument();
    // 갈아탄 갈래에는 업로드가 없다. 저작 사진은 올리는 물건이 아니라 나온 물건이다.
    expect(
      screen.queryByText("detailPage.brandAssets.uploadImage"),
    ).not.toBeInTheDocument();
  });

  it("슬롯을 안 꽂으면 탭 없이 브랜드 자산만 뜬다", async () => {
    mockList.mockResolvedValue([]);

    renderPanel();

    expect(
      await screen.findByText("detailPage.brandAssets.uploadImage"),
    ).toBeInTheDocument();
    // 저작이라는 앱 도메인이 없는 소비자에게 빈 탭을 보이느니 한 갈래로 둔다.
    expect(
      screen.queryByRole("button", { name: "detailPage.brandAssets.sourceAuthored" }),
    ).not.toBeInTheDocument();
  });
});
