import { describe, expect, it, vi, afterEach } from "vitest";

const mockFetchCafe24Products = vi.fn();
const mockFetchCafe24ProductDetail = vi.fn();
const mockFetchCafe24ProductOptions = vi.fn();
const mockFetchCafe24ProductCategories = vi.fn();
const mockFetchNaverProducts = vi.fn();
const mockFetchNaverProductDetail = vi.fn();
const mockCoupangListListings = vi.fn();
const mockCoupangGetListing = vi.fn();

import {
  listDetailPageProducts,
  loadDetailPageProductSnapshot,
  parseDetailPageProductSource,
  supportsCafe24ListFilters,
} from "../product-source";
import { stubDetailPageHost } from "../../../components/detail-page/__tests__/host-stub";

/**
 * 소싱 서버 호출은 이제 인자로 들어온다 — 이 파일은 훅을 못 쓰는 자리라
 * `DetailPageHost` 를 그대로 넘긴다. 모듈을 갈아 끼우지 않으므로 셸이 어느 앱 안에
 * 있는지와 무관하게 돈다.
 */
const host = stubDetailPageHost({
  api: {
    fetchCafe24Products: (...args) => mockFetchCafe24Products(...args),
    fetchCafe24ProductDetail: (...args) => mockFetchCafe24ProductDetail(...args),
    fetchCafe24ProductOptions: (...args) => mockFetchCafe24ProductOptions(...args),
    fetchCafe24ProductCategories: (...args) => mockFetchCafe24ProductCategories(...args),
    fetchNaverProducts: (...args) => mockFetchNaverProducts(...args),
    fetchNaverProductDetail: (...args) => mockFetchNaverProductDetail(...args),
  },
  product: {
    coupangApi: {
      listListings: (...args: unknown[]) => mockCoupangListListings(...args),
      getListing: (...args: unknown[]) => mockCoupangGetListing(...args),
    },
    // 어댑터는 실제 규칙을 지켜야 응답 정규화를 잴 수 있다 — 셸 안에서 다시 적는다.
    getCafe24ProductNo: (product) =>
      (product as { product_no?: number }).product_no ?? 0,
    extractCafe24ProductOptions: (value) =>
      ((value as { options?: unknown[] } | null)?.options ?? []) as never,
    extractCafe24ProductCategories: (value) =>
      ((value as { categories?: unknown[] } | null)?.categories ?? []) as never,
  },
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("parseDetailPageProductSource", () => {
  it("accepts every supported platform", () => {
    expect(parseDetailPageProductSource("cafe24")).toBe("cafe24");
    expect(parseDetailPageProductSource("naver")).toBe("naver");
    expect(parseDetailPageProductSource("coupang")).toBe("coupang");
  });

  it("falls back to cafe24 for unknown or missing values", () => {
    expect(parseDetailPageProductSource(null)).toBe("cafe24");
    expect(parseDetailPageProductSource("")).toBe("cafe24");
    expect(parseDetailPageProductSource("amazon")).toBe("cafe24");
  });

  it("only exposes cafe24 list filters for cafe24", () => {
    expect(supportsCafe24ListFilters("cafe24")).toBe(true);
    expect(supportsCafe24ListFilters("naver")).toBe(false);
    expect(supportsCafe24ListFilters("coupang")).toBe(false);
  });
});

describe("loadDetailPageProductSnapshot — cafe24", () => {
  const detail = {
    originProductNo: 33580,
    originProduct: {
      name: "러플 스트링 끈나시 롱 원피스",
      detailContent: "<p>상세</p>",
      images: { representativeImage: { url: "https://cdn/rep.jpg" } },
    },
    _cafe24_raw: { product_info_version: "v9" },
    detailPage: {
      design_tone_recommendations: [{ tone: "Editorial", code: "editorial" }],
      search_keyword: "끈나시 원피스",
      source_image_urls: ["https://cdn/a.jpg"],
      spec_shipping: "배송 방법: 택배",
    },
  };

  it("keeps prefilling when the auxiliary option lookup fails", async () => {
    mockFetchCafe24ProductDetail.mockResolvedValue(detail);
    mockFetchCafe24ProductOptions.mockRejectedValue(
      new Error("Cafe24 auth server request failed: 422"),
    );
    mockFetchCafe24ProductCategories.mockResolvedValue({
      categories: [{ category_no: 79, category_name: "원피스" }],
    });

    const snapshot = await loadDetailPageProductSnapshot(host, "cafe24", "33580");

    expect(snapshot.productName).toBe("러플 스트링 끈나시 롱 원피스");
    expect(snapshot.categories).toEqual(["원피스"]);
    expect(snapshot.options).toEqual([]);
    expect(snapshot.degraded).toEqual([
      {
        field: "options",
        message: "Cafe24 auth server request failed: 422",
      },
    ]);
  });

  it("surfaces the backend detailPage block the UI used to ignore", async () => {
    mockFetchCafe24ProductDetail.mockResolvedValue(detail);
    mockFetchCafe24ProductOptions.mockResolvedValue({ options: [] });
    mockFetchCafe24ProductCategories.mockResolvedValue({ categories: [] });

    const snapshot = await loadDetailPageProductSnapshot(host, "cafe24", "33580");

    expect(snapshot.backendToneSources[0]).toMatchObject({
      design_tone_recommendations: [{ tone: "Editorial", code: "editorial" }],
    });
    expect(snapshot.backendKeywordCandidates[0]).toBe("끈나시 원피스");
    expect(snapshot.backendSourceImageUrls).toEqual(["https://cdn/a.jpg"]);
    expect(snapshot.backendSpecShipping).toBe("배송 방법: 택배");
    expect(snapshot.productInfoVersion).toBe("v9");
  });

  it("rejects when the required detail lookup fails", async () => {
    mockFetchCafe24ProductDetail.mockRejectedValue(new Error("boom"));
    mockFetchCafe24ProductOptions.mockResolvedValue({ options: [] });
    mockFetchCafe24ProductCategories.mockResolvedValue({ categories: [] });

    await expect(
      loadDetailPageProductSnapshot(host, "cafe24", "33580"),
    ).rejects.toThrow("boom");
  });
});

describe("loadDetailPageProductSnapshot — naver", () => {
  it("normalizes the origin product into the shared snapshot shape", async () => {
    mockFetchNaverProductDetail.mockResolvedValue({
      originProduct: {
        name: "네이버 원피스",
        detailContent: "<p>네이버 상세</p>",
        leafCategoryId: "50000167",
        images: {
          representativeImage: { url: "https://n/rep.jpg" },
          optionalImages: [{ url: "https://n/opt.jpg" }],
        },
        deliveryInfo: {
          deliveryCompany: "CJ",
          deliveryFee: { baseFee: 3000 },
          claimDeliveryInfo: { returnDeliveryFee: 5000 },
        },
        detailAttribute: {
          naverShoppingSearchInfo: { brandName: "레비오사" },
          originAreaInfo: { content: "국내산" },
          optionInfo: {
            optionSimple: [
              { id: 1, groupName: "색상", name: "블랙", usable: true },
              { id: 2, groupName: "색상", name: "화이트", usable: true },
              { id: 3, groupName: "사이즈", name: "M", usable: true },
            ],
          },
          seoInfo: { sellerTags: [{ text: "여름원피스" }] },
        },
      },
    });

    const snapshot = await loadDetailPageProductSnapshot(host, "naver", "123");

    expect(snapshot.source).toBe("naver");
    expect(snapshot.productName).toBe("네이버 원피스");
    expect(snapshot.options).toEqual(["색상: 블랙, 화이트", "사이즈: M"]);
    expect(snapshot.representativeImageUrl).toBe("https://n/rep.jpg");
    expect(snapshot.backendSourceImageUrls).toEqual(["https://n/opt.jpg"]);
    expect(snapshot.specText).toContain("브랜드: 레비오사");
    expect(snapshot.shippingText).toContain("배송비: 3000");
    expect(snapshot.backendKeywordCandidates).toContain("여름원피스");
  });

  it("uses the CS_OPT copy the sourcing server read back out of detailContent", async () => {
    mockFetchNaverProductDetail.mockResolvedValue({
      originProduct: {
        name: "네이버 원피스",
        detailContent: "<p>원본</p>",
      },
      detailPage: {
        summary_description: "여름용 린넨 롱 원피스입니다.",
        simple_description: "주요 특징\n시원한 린넨 혼방\n허리 스트링 조절",
        source_image_urls: ["https://n/detail-1.jpg"],
        cs_opt_context_found: true,
        source: "cs_opt_detail_content",
      },
    });

    const snapshot = await loadDetailPageProductSnapshot(host, "naver", "123");

    expect(snapshot.summaryDescription).toBe("여름용 린넨 롱 원피스입니다.");
    expect(snapshot.simpleDescription).toContain("시원한 린넨 혼방");
    expect(snapshot.backendSourceImageUrls).toContain("https://n/detail-1.jpg");
  });

  it("falls back to the raw detail when the product never ran CS_OPT", async () => {
    mockFetchNaverProductDetail.mockResolvedValue({
      originProduct: {
        name: "네이버 원피스",
        detailContent: "<p>원본</p>",
      },
      detailPage: {
        summary_description: "",
        simple_description: "",
        source_image_urls: [],
        cs_opt_context_found: false,
        source: "raw_detail_content",
      },
    });

    const snapshot = await loadDetailPageProductSnapshot(host, "naver", "123");

    expect(snapshot.summaryDescription).toBe("");
    expect(snapshot.detailContent).toBe("<p>원본</p>");
  });
});

describe("loadDetailPageProductSnapshot — coupang", () => {
  it("normalizes a listing into the shared snapshot shape", async () => {
    mockCoupangGetListing.mockResolvedValue({
      data: {
        sellerProductId: "77",
        sellerProductName: "쿠팡 원피스",
        displayCategoryCode: "1001",
        images: [
          { imageOrder: 1, imageType: "DETAIL", cdnPath: "https://c/b.jpg" },
          { imageOrder: 0, imageType: "REPRESENTATION", cdnPath: "https://c/a.jpg" },
        ],
        items: [
          {
            attributes: [
              { attributeTypeName: "색상", attributeValueName: "블랙" },
              { attributeTypeName: "색상", attributeValueName: "블랙" },
            ],
          },
        ],
      },
    });

    const snapshot = await loadDetailPageProductSnapshot(host, "coupang", "77");

    expect(snapshot.productName).toBe("쿠팡 원피스");
    expect(snapshot.representativeImageUrl).toBe("https://c/a.jpg");
    expect(snapshot.backendSourceImageUrls).toEqual([
      "https://c/a.jpg",
      "https://c/b.jpg",
    ]);
    expect(snapshot.options).toEqual(["색상: 블랙"]);
  });
});

describe("listDetailPageProducts", () => {
  it("paginates cafe24 by page number", async () => {
    mockFetchCafe24Products.mockResolvedValue({
      items: [{ product_no: 1, product_name: "A", list_image: "https://c/1.jpg" }],
      page_size: 20,
      total: 40,
    });

    const page = await listDetailPageProducts(host, "cafe24", { pageSize: 20 });

    expect(page.items).toEqual([
      {
        source: "cafe24",
        productNo: "1",
        name: "A",
        imageUrl: "https://c/1.jpg",
      },
    ]);
    expect(page.nextCursor).toBe("2");
  });

  it("paginates coupang by nextToken", async () => {
    mockCoupangListListings.mockResolvedValue({
      data: [
        {
          sellerProductId: "9",
          sellerProductName: "쿠팡 상품",
          representativeImage: "https://c/9.jpg",
        },
      ],
      nextToken: "tok",
    });

    const page = await listDetailPageProducts(host, "coupang", { pageSize: 20 });

    expect(page.items[0]).toEqual({
      source: "coupang",
      productNo: "9",
      name: "쿠팡 상품",
      imageUrl: "https://c/9.jpg",
    });
    expect(page.nextCursor).toBe("tok");
  });

  it("filters naver results by name because the list API has no keyword param", async () => {
    mockFetchNaverProducts.mockResolvedValue({
      contents: [
        {
          originProductNo: 1,
          channelProducts: [
            { name: "여름 원피스", representativeImage: { url: "https://n/1.jpg" } },
          ],
        },
        {
          originProductNo: 2,
          channelProducts: [{ name: "겨울 코트" }],
        },
      ],
      totalPages: 1,
    });

    const page = await listDetailPageProducts(host, "naver", {
      pageSize: 20,
      query: "원피스",
    });

    expect(page.items.map((item) => item.productNo)).toEqual(["1"]);
    expect(page.nextCursor).toBeNull();
  });
});
