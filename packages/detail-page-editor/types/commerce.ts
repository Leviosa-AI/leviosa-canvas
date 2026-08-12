/**
 * 편집기가 커머스 플랫폼 응답에서 **실제로 읽는 것**만.
 *
 * 프리필(업로드 3루트)이 카페24·네이버·쿠팡 상품을 읽어 설문을 채운다. 그래서 편집기는
 * 이 응답들의 모양을 어느 정도 알아야 한다 — 완전히 불투명하게 두면 프리필이 못 선다.
 *
 * 다만 앱의 커머스 타입 전체(수백 줄)를 여기 옮기지는 않았다. 편집기는 카페24 클라이언트가
 * 아니고, 소비자(agency)는 그 타입을 갖고 있지도 않다. 그래서 **읽는 필드만** 선언한다.
 *
 * ## 드리프트는 어떻게 잡히나
 *
 * 앱이 자기 진짜 타입으로 `DetailPageHost` 를 구현할 때 tsc 가 대입 가능성을 잰다.
 * 앱 쪽에서 여기 적힌 필드가 사라지면 그 자리에서 즉시 죽는다 — 우리가 앱 타입을
 * 직접 가져오지 않고도 계약이 지켜지는 이유다. 반대로 앱에 필드가 **더** 있는 것은
 * 아무 문제가 없다(구조적 타이핑).
 *
 * 여는 쪽은 전부 옵셔널로 뒀다. 편집기 코드가 이미 옵셔널 체이닝과 방어적 문자열
 * 추출로 읽고 있어서, 여기서 필수로 못 박으면 앱의 진짜 타입이 더 느슨할 때 대입이
 * 깨진다. 이 파일은 "최소한 이만큼은 온다"가 아니라 "이만큼을 본다"는 선언이다.
 */

/** 진열·판매 플래그. */
export type Cafe24Flag = "T" | "F";

// ── 카페24 ────────────────────────────────────────────────────

export interface Cafe24ProductListParams {
  page?: number;
  page_size?: number;
  query?: string;
  category_name?: string;
  include_sub_category?: boolean;
  display?: Cafe24Flag | string | null;
  selling?: Cafe24Flag | string | null;
  include_details?: boolean;
}

/** 목록 한 줄. 이름과 썸네일 후보만 본다. */
export interface Cafe24ProductSummary {
  product_name?: string | null;
  name?: string | null;
  list_image?: string | null;
  tiny_image?: string | null;
  small_image?: string | null;
  detail_image?: string | null;
}

export interface Cafe24ProductListPage {
  items: Cafe24ProductSummary[];
  page_size: number;
  total: number;
}

/**
 * 상세. 나머지 필드는 코드가 `Record<string, unknown>` 으로 캐스팅해 방어적으로 읽으므로
 * 여기 적힌 것이 편집기가 **타입으로** 아는 전부다.
 */
export interface Cafe24ProductDetailPayload {
  _cafe24_raw?: unknown;
  originProduct?: {
    name?: string | null;
    summary_description?: string | null;
    simple_description?: string | null;
    detailContent?: string | null;
    images?: { representativeImage?: { url?: string | null } | null } | null;
  } | null;
}

/** 새로고침 힌트. 상세·옵션·카테고리 조회가 공유한다. */
export interface Cafe24RefreshParams {
  force_refresh?: boolean;
  known_product_info_version?: string;
}

// ── 네이버 ────────────────────────────────────────────────────

export interface NaverProductListParams {
  page?: number;
  size?: number;
}

export interface NaverProductListPage {
  contents: Array<{
    originProductNo: number | string;
    channelProducts?: Array<{
      name?: string | null;
      representativeImage?: { url?: string | null } | null;
    }> | null;
  }>;
  totalPages?: number | null;
}

export interface NaverProductDetailPayload {
  originProduct?: {
    name?: string | null;
    detailContent?: string | null;
    leafCategoryId?: string | number | null;
    images?: {
      representativeImage?: { url?: string | null } | null;
      optionalImages?: Array<{ url?: string | null } | null> | null;
    } | null;
    detailAttribute?: {
      optionInfo?: {
        optionSimple?: Array<{
          groupName?: string | null;
          name?: string | null;
        }> | null;
      } | null;
      originAreaInfo?: { content?: string | null } | null;
      naverShoppingSearchInfo?: { brandName?: string | null } | null;
      seoInfo?: { sellerTags?: Array<{ text?: string | null }> | null } | null;
    } | null;
    deliveryInfo?: {
      deliveryCompany?: string | null;
      deliveryFee?: { baseFee?: number | string | null } | null;
      claimDeliveryInfo?: { returnDeliveryFee?: number | string | null } | null;
    } | null;
  } | null;
}

// ── 쿠팡 ──────────────────────────────────────────────────────
//
// 쿠팡만 소싱 서버가 아니라 자체 클라이언트다. 그래서 호출 모양도 다르다
// (`{ signal }` 을 옵션 객체로 받는다).

export interface CoupangListListingsParams {
  nextToken?: string;
  maxPerPage?: number;
  name?: string;
  signal?: AbortSignal;
}

export interface CoupangListingListPage {
  data: Array<{
    sellerProductId: number | string;
    sellerProductName?: string | null;
    representativeImage?: string | null;
  }>;
  nextToken?: string | null;
}

export interface CoupangListingDetail {
  data: {
    sellerProductName?: string | null;
    displayCategoryCode?: string | number | null;
    items?: Array<{
      attributes?: Array<{
        attributeTypeName?: string | null;
        attributeValueName?: string | null;
      }> | null;
    }> | null;
    images?: Array<{
      imageOrder?: number | null;
      cdnPath?: string | null;
      vendorPath?: string | null;
    }> | null;
  };
}
