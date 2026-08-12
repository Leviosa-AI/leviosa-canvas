/**
 * 상세페이지 생성기의 상품 소스(플랫폼) 추상화.
 *
 * 생성기는 원래 카페24 Admin API만 호출했다. 셀러가 연동한 플랫폼은 카페24 외에도
 * 네이버·쿠팡이 있으므로, 어떤 플랫폼에서 상품을 가져올지 먼저 고르고 그 플랫폼의
 * API로 목록/상세를 조회한다. 이 모듈은 플랫폼별 응답을 생성기가 쓰는 하나의
 * 스냅샷 형태로 정규화한다.
 *
 * 보조 정보(옵션·카테고리) 조회가 실패해도 상세 조회가 성공했다면 프리필을 진행한다.
 * 예전에는 `Promise.all` 이라 옵션 하나가 500이면 프리필 전체가 버려졌다.
 */

import type {
  Cafe24Flag,
  DetailPageHost,
} from "../../components/detail-page/detail-page-host-context";

export const DETAIL_PAGE_PRODUCT_SOURCES = [
  "cafe24",
  "naver",
  "coupang",
] as const;

export type DetailPageProductSource =
  (typeof DETAIL_PAGE_PRODUCT_SOURCES)[number];

export const DEFAULT_DETAIL_PAGE_PRODUCT_SOURCE: DetailPageProductSource =
  "cafe24";

/** 상품 목록/상세 API가 아직 없어 선택지로만 노출하는 플랫폼. */
export const DETAIL_PAGE_UNSUPPORTED_SOURCES = ["amazon"] as const;

export type DetailPageUnsupportedSource =
  (typeof DETAIL_PAGE_UNSUPPORTED_SOURCES)[number];

export function parseDetailPageProductSource(
  value: string | null | undefined,
): DetailPageProductSource {
  const normalized = (value ?? "").trim().toLowerCase();
  return (
    DETAIL_PAGE_PRODUCT_SOURCES.find((source) => source === normalized) ??
    DEFAULT_DETAIL_PAGE_PRODUCT_SOURCE
  );
}

/** 목록 화면에 필요한 최소 상품 정보. */
export interface DetailPageProductListItem {
  source: DetailPageProductSource;
  /** 플랫폼별 상품 식별자. 쿠팡은 숫자가 아닐 수 있어 문자열로 다룬다. */
  productNo: string;
  name: string;
  imageUrl: string;
}

export interface DetailPageProductListPage {
  items: DetailPageProductListItem[];
  /** 다음 페이지 요청에 쓸 커서. 없으면 마지막 페이지. */
  nextCursor: string | null;
}

export interface DetailPageProductListParams {
  /** 1-based 페이지 번호 또는 커서. */
  cursor?: string | null;
  pageSize: number;
  query?: string;
  categoryName?: string;
  display?: Cafe24Flag;
  selling?: Cafe24Flag;
  signal?: AbortSignal;
}

/** 프리필 도중 실패했지만 진행을 막지 않은 보조 조회. */
export interface DetailPageProductDegradation {
  field: "options" | "categories";
  message: string;
}

/**
 * 플랫폼 응답을 생성기가 소비하는 하나의 형태로 정규화한 결과.
 *
 * 카페24 경로는 기존 동작을 그대로 유지한다(필드 우선순위 포함).
 */
export interface DetailPageProductSnapshot {
  source: DetailPageProductSource;
  productNo: string;
  productName: string;
  summaryDescription: string;
  simpleDescription: string;
  detailContent: string;
  categories: string[];
  options: string[];
  representativeImageUrl: string;
  specText: string;
  shippingText: string;
  productInfoVersion: string;
  /** 백엔드가 계산해 준 소스 이미지 목록(있는 플랫폼만). */
  backendSourceImageUrls: string[];
  /** 백엔드 추천 검색 키워드 후보(우선순위 순). */
  backendKeywordCandidates: unknown[];
  /** 백엔드가 만든 규격/배송 텍스트. */
  backendSpecShipping: string;
  /**
   * 백엔드 톤 추천이 담긴 레코드들. 생성기의 `pickBackendDesignTone(...sources)` 에
   * 그대로 펼쳐 넘긴다.
   */
  backendToneSources: Array<Record<string, unknown> | null>;
  degraded: DetailPageProductDegradation[];
}

export interface DetailPageSnapshotParams {
  forceRefresh?: boolean;
  knownProductInfoVersion?: string;
  signal?: AbortSignal;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }
  return "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "unknown error");
}

function normalizeCategoryText(category: unknown): string {
  const record = asRecord(category);
  if (!record) return firstString(category);
  return firstString(
    record.full_category_name,
    record.fullCategoryName,
    record.category_name,
    record.categoryName,
    record.name,
    record.path,
    record.category_no != null ? String(record.category_no) : "",
  );
}

// ── 카페24 ────────────────────────────────────────────────────

async function listCafe24Products(
  host: DetailPageHost,
  params: DetailPageProductListParams,
): Promise<DetailPageProductListPage> {
  const page = Number(params.cursor ?? "1") || 1;
  const response = await host.api.fetchCafe24Products({
    page,
    page_size: params.pageSize,
    query: params.query || undefined,
    category_name: params.categoryName || undefined,
    include_sub_category: params.categoryName ? true : undefined,
    display: params.display,
    selling: params.selling,
    include_details: false,
  });
  const items = response.items.map((product) => ({
    source: "cafe24" as const,
    productNo: String(host.product.getCafe24ProductNo(product) ?? ""),
    name:
      product.product_name ||
      product.name ||
      `#${host.product.getCafe24ProductNo(product) ?? ""}`,
    imageUrl: firstString(
      product.list_image,
      product.tiny_image,
      product.small_image,
      product.detail_image,
    ),
  }));
  const hasMore = page * response.page_size < response.total;
  return { items, nextCursor: hasMore ? String(page + 1) : null };
}

async function loadCafe24Snapshot(
  host: DetailPageHost,
  productNo: string,
  params: DetailPageSnapshotParams,
): Promise<DetailPageProductSnapshot> {
  const numericProductNo = Number(productNo);
  const refreshParams = {
    force_refresh: Boolean(params.forceRefresh),
    known_product_info_version: params.knownProductInfoVersion || undefined,
  };

  // 상세는 필수, 옵션/카테고리는 보조. 보조 조회가 죽어도 프리필은 살린다.
  const [detail, optionsResult, categoriesResult] = await Promise.all([
    host.api.fetchCafe24ProductDetail(numericProductNo, params.signal, refreshParams),
    settled(
      host.api.fetchCafe24ProductOptions(numericProductNo, 1, params.signal, refreshParams),
    ),
    settled(
      host.api.fetchCafe24ProductCategories(
        numericProductNo,
        1,
        params.signal,
        refreshParams,
      ),
    ),
  ]);

  const degraded: DetailPageProductDegradation[] = [];
  if (optionsResult.error) {
    degraded.push({ field: "options", message: errorMessage(optionsResult.error) });
  }
  if (categoriesResult.error) {
    degraded.push({
      field: "categories",
      message: errorMessage(categoriesResult.error),
    });
  }

  const detailRecord = detail as unknown as Record<string, unknown>;
  const rawRecord = asRecord(detail._cafe24_raw) ?? {};
  const origin = detail.originProduct;
  const originRecord = asRecord(origin) ?? {};
  const enrichment = asRecord(detailRecord.detailPage) ?? asRecord(rawRecord.detailPage);

  const options = host.product.extractCafe24ProductOptions(optionsResult.value).map(
    (option) => {
      const optionRecord = asRecord(option);
      if (!optionRecord) return "";
      const optionName = firstString(optionRecord.option_name, optionRecord.name);
      const optionValues = asArray(
        optionRecord.option_value ??
          optionRecord.option_values ??
          optionRecord.values,
      )
        .map((item) => {
          const itemRecord = asRecord(item);
          if (!itemRecord) return firstString(item);
          return firstString(
            itemRecord.option_text,
            itemRecord.option_value,
            itemRecord.value,
            itemRecord.name,
          );
        })
        .filter(Boolean);
      if (!optionName && optionValues.length === 0) return "";
      const optionText = `${optionName || "option"}: ${optionValues.join(", ")}`;
      if (/개인정보/.test(optionText)) return "";
      return optionText;
    },
  );

  return {
    source: "cafe24",
    productNo,
    productName: firstString(
      origin?.name,
      rawRecord.product_name,
      rawRecord.name,
    ),
    summaryDescription: firstString(
      origin?.summary_description,
      originRecord.summary_description,
      rawRecord.summary_description,
    ),
    simpleDescription: firstString(
      originRecord.simple_summary,
      rawRecord.simple_summary,
      origin?.simple_description,
      originRecord.simple_description,
      rawRecord.simple_description,
    ),
    detailContent: firstString(
      origin?.detailContent,
      rawRecord.description,
      rawRecord.mobile_description,
    ),
    categories: host.product.extractCafe24ProductCategories(categoriesResult.value).map(
      normalizeCategoryText,
    ),
    options: options.filter(Boolean),
    representativeImageUrl: firstString(
      origin?.images?.representativeImage?.url,
    ),
    specText: firstString(
      rawRecord.specification,
      rawRecord.spec,
      rawRecord.additional_information,
      rawRecord.additional_info,
    ),
    shippingText: firstString(
      rawRecord.shipping_info,
      rawRecord.shipping,
      rawRecord.delivery_info,
      rawRecord.delivery,
    ),
    productInfoVersion: firstString(
      rawRecord.product_info_version,
      detailRecord.product_info_version,
      rawRecord.productInfoVersion,
      detailRecord.productInfoVersion,
      rawRecord.version,
      detailRecord.version,
      params.knownProductInfoVersion,
      "unversioned",
    ),
    backendSourceImageUrls: [
      ...asArray(enrichment?.source_image_urls),
      ...asArray(rawRecord.source_image_urls),
      ...asArray(detailRecord.source_image_urls),
    ]
      .map((item) => firstString(item))
      .filter(Boolean),
    backendKeywordCandidates: [
      enrichment?.search_keyword,
      enrichment?.suggested_search_keyword,
      enrichment?.pandarank_search_keyword,
      rawRecord.search_keyword,
      detailRecord.search_keyword,
      rawRecord.pandarank_search_keyword,
      detailRecord.pandarank_search_keyword,
      rawRecord.suggested_search_keyword,
      detailRecord.suggested_search_keyword,
    ],
    backendSpecShipping: firstString(
      enrichment?.spec_shipping,
      rawRecord.spec_shipping,
      detailRecord.spec_shipping,
    ),
    // detailPage 를 먼저 본다. 백엔드 톤 추천은 이 블록 아래에만 들어 있어
    // 최상위만 훑던 예전 코드에서는 한 번도 읽히지 않았다.
    backendToneSources: [enrichment, rawRecord, detailRecord],
    degraded,
  };
}

// ── 네이버 ────────────────────────────────────────────────────

async function listNaverProducts(
  host: DetailPageHost,
  params: DetailPageProductListParams,
): Promise<DetailPageProductListPage> {
  const page = Number(params.cursor ?? "1") || 1;
  const response = await host.api.fetchNaverProducts(
    { page, size: params.pageSize },
    params.signal,
  );
  const keyword = (params.query ?? "").trim().toLowerCase();
  const items = response.contents
    .map((product) => {
      const channel = product.channelProducts?.[0];
      return {
        source: "naver" as const,
        productNo: String(product.originProductNo),
        name: channel?.name || `#${product.originProductNo}`,
        imageUrl: firstString(channel?.representativeImage?.url),
      };
    })
    // 네이버 목록 API는 이름 검색 파라미터를 노출하지 않아 클라이언트에서 거른다.
    .filter((item) => !keyword || item.name.toLowerCase().includes(keyword));
  const hasMore = page < (response.totalPages ?? 0);
  return { items, nextCursor: hasMore ? String(page + 1) : null };
}

async function loadNaverSnapshot(
  host: DetailPageHost,
  productNo: string,
  params: DetailPageSnapshotParams,
): Promise<DetailPageProductSnapshot> {
  const detail = await host.api.fetchNaverProductDetail(Number(productNo), params.signal);
  const origin = detail.originProduct;
  const detailRecord = detail as unknown as Record<string, unknown>;
  const enrichment = asRecord(detailRecord.detailPage);

  const optionGroups = new Map<string, string[]>();
  for (const option of origin?.detailAttribute?.optionInfo?.optionSimple ?? []) {
    const groupName = firstString(option.groupName) || "option";
    const values = optionGroups.get(groupName) ?? [];
    const name = firstString(option.name);
    if (name && !values.includes(name)) values.push(name);
    optionGroups.set(groupName, values);
  }

  const deliveryInfo = origin?.deliveryInfo;
  const shippingText = [
    deliveryInfo?.deliveryCompany
      ? `배송 업체: ${deliveryInfo.deliveryCompany}`
      : "",
    deliveryInfo?.deliveryFee?.baseFee != null
      ? `배송비: ${deliveryInfo.deliveryFee.baseFee}`
      : "",
    deliveryInfo?.claimDeliveryInfo?.returnDeliveryFee != null
      ? `반품 배송비: ${deliveryInfo.claimDeliveryInfo.returnDeliveryFee}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const originArea = origin?.detailAttribute?.originAreaInfo?.content;
  const brandName = origin?.detailAttribute?.naverShoppingSearchInfo?.brandName;
  const specText = [
    brandName ? `브랜드: ${brandName}` : "",
    originArea ? `원산지: ${originArea}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    source: "naver",
    productNo,
    productName: firstString(origin?.name),
    // CS_OPT 를 거친 상품은 소싱 서버가 detailContent 하단에 실어둔 요약을
    // 되읽어 detailPage 로 돌려준다. 미적용 상품은 빈 문자열 → 원본 폴백.
    summaryDescription: firstString(enrichment?.summary_description),
    simpleDescription: firstString(enrichment?.simple_description),
    detailContent: firstString(origin?.detailContent),
    categories: [firstString(origin?.leafCategoryId)].filter(Boolean),
    options: [...optionGroups.entries()]
      .map(([groupName, values]) =>
        values.length ? `${groupName}: ${values.join(", ")}` : "",
      )
      .filter(Boolean),
    representativeImageUrl: firstString(
      origin?.images?.representativeImage?.url,
    ),
    specText,
    shippingText,
    productInfoVersion: firstString(
      detailRecord.product_info_version,
      params.knownProductInfoVersion,
      "unversioned",
    ),
    backendSourceImageUrls: [
      ...asArray(enrichment?.source_image_urls),
      ...(origin?.images?.optionalImages ?? []).map((image) =>
        firstString(image?.url),
      ),
    ].filter(Boolean) as string[],
    backendKeywordCandidates: [
      enrichment?.search_keyword,
      enrichment?.suggested_search_keyword,
      ...(origin?.detailAttribute?.seoInfo?.sellerTags ?? []).map(
        (tag) => tag.text,
      ),
    ],
    backendSpecShipping: firstString(enrichment?.spec_shipping),
    backendToneSources: [enrichment],
    degraded: [],
  };
}

// ── 쿠팡 ──────────────────────────────────────────────────────

async function listCoupangProducts(
  host: DetailPageHost,
  params: DetailPageProductListParams,
): Promise<DetailPageProductListPage> {
  const response = await host.product.coupangApi.listListings({
    nextToken: params.cursor || undefined,
    maxPerPage: params.pageSize,
    name: params.query || undefined,
    signal: params.signal,
  });
  return {
    items: response.data.map((listing) => ({
      source: "coupang" as const,
      productNo: String(listing.sellerProductId),
      name: listing.sellerProductName || `#${listing.sellerProductId}`,
      imageUrl: firstString(listing.representativeImage),
    })),
    nextCursor: response.nextToken || null,
  };
}

async function loadCoupangSnapshot(
  host: DetailPageHost,
  productNo: string,
  params: DetailPageSnapshotParams,
): Promise<DetailPageProductSnapshot> {
  const response = await host.product.coupangApi.getListing(productNo, {
    signal: params.signal,
  });
  const listing = response.data;

  const attributeGroups = new Map<string, string[]>();
  for (const item of listing.items ?? []) {
    for (const attribute of item.attributes ?? []) {
      const groupName = firstString(attribute.attributeTypeName) || "option";
      const values = attributeGroups.get(groupName) ?? [];
      const value = firstString(attribute.attributeValueName);
      if (value && !values.includes(value)) values.push(value);
      attributeGroups.set(groupName, values);
    }
  }

  const images = (listing.images ?? [])
    .slice()
    .sort((a, b) => (a.imageOrder ?? 0) - (b.imageOrder ?? 0))
    .map((image) => firstString(image.cdnPath, image.vendorPath))
    .filter(Boolean);

  return {
    source: "coupang",
    productNo,
    productName: firstString(listing.sellerProductName),
    summaryDescription: "",
    simpleDescription: "",
    detailContent: "",
    categories: [firstString(listing.displayCategoryCode)].filter(Boolean),
    options: [...attributeGroups.entries()]
      .map(([groupName, values]) => `${groupName}: ${values.join(", ")}`)
      .filter(Boolean),
    representativeImageUrl: images[0] ?? "",
    specText: "",
    shippingText: "",
    productInfoVersion: firstString(params.knownProductInfoVersion, "unversioned"),
    backendSourceImageUrls: images,
    backendKeywordCandidates: [],
    backendSpecShipping: "",
    backendToneSources: [],
    degraded: [],
  };
}

// ── 디스패치 ──────────────────────────────────────────────────

async function settled<T>(
  promise: Promise<T>,
): Promise<{ value: T | null; error: unknown }> {
  try {
    return { value: await promise, error: null };
  } catch (error) {
    return { value: null, error };
  }
}

/**
 * `host`가 첫 인자인 이유: 이 파일은 훅을 못 쓴다(컴포넌트가 아니다). 소싱 서버 호출을
 * 모듈 수준에서 import 하면 셸이 앱에 박히므로, 데이터 접근은 호출부가 넘긴다.
 */
export function listDetailPageProducts(
  host: DetailPageHost,
  source: DetailPageProductSource,
  params: DetailPageProductListParams,
): Promise<DetailPageProductListPage> {
  switch (source) {
    case "naver":
      return listNaverProducts(host, params);
    case "coupang":
      return listCoupangProducts(host, params);
    case "cafe24":
    default:
      return listCafe24Products(host, params);
  }
}

export function loadDetailPageProductSnapshot(
  host: DetailPageHost,
  source: DetailPageProductSource,
  productNo: string,
  params: DetailPageSnapshotParams = {},
): Promise<DetailPageProductSnapshot> {
  switch (source) {
    case "naver":
      return loadNaverSnapshot(host, productNo, params);
    case "coupang":
      return loadCoupangSnapshot(host, productNo, params);
    case "cafe24":
    default:
      return loadCafe24Snapshot(host, productNo, params);
  }
}

/** 카페24만 지원하는 목록 필터를 노출할지 여부. */
export function supportsCafe24ListFilters(
  source: DetailPageProductSource,
): boolean {
  return source === "cafe24";
}
