"use client";

/**
 * `DetailPageHost` — 편집기가 바깥 세상과 만나는 **유일한 자리**.
 *
 * 소싱 서버 호출, 브랜드 저장소, react-query 캐시 키, 알림. 편집기가 앱에 물릴 수 있는
 * 것 전부가 이 인터페이스 하나로 들어온다. 소비자가 자기 base URL·토큰·캐시 키를 꽂으면
 * 되므로, "프론트 라이브러리만 설치하고 백엔드는 카페24 소싱 서버를 계속 쓴다"가 성립한다.
 *
 * ## 앱 안에 살 때와 무엇이 달라졌나
 *
 * 프론트 안에 있을 때 이 파일은 앱의 소싱 API 모듈을 이름공간 타입으로 들여오는 문
 * 열두 줄로 계약을 적었다. 이름만 고르고 시그니처는 앱에서 끌어오면 드리프트가 0이라
 * 그게 옳았다 — **앱 안에 사는 동안에는**. 패키지는 그 모듈에 닿을 수 없으므로 이제
 * 시그니처를 직접 적는다.
 *
 * 그렇다고 드리프트가 열린 것은 아니다. 앱이 자기 진짜 구현으로 이 인터페이스를 채울 때
 * (`leviosa-frontend` 의 `src/lib/detail-page-host.ts`) tsc 가 대입 가능성을 잰다.
 * 앱 쪽 시그니처가 바뀌면 그 자리에서 죽는다. 검사가 사라진 게 아니라 **자리를 옮겼다**.
 *
 * ## 세 종류가 아니라 한 종류
 *
 * 여기 오는 것은 전부 **데이터 접근과 알림**이다. 편집기가 쓰는 부품(색 입력·툴팁·폰트
 * 목록)은 패키지가 동봉하고, 앱 셸의 크롬(크레딧·언어·요금제)은 노드로 꽂는다. 그 둘은
 * 이 파일에 없다 — 섞이면 소비자가 무엇을 구현해야 하는지가 흐려진다.
 */

import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react";

import type {
  DesignReferenceInput,
  DetailPageDesignBriefResult,
  DetailPageEditQuotaDetail,
  DetailPageEditUsageResult,
  DetailPageGroupEditItem,
  DetailPageGroupPromptEditResult,
  DetailPageImageEditResult,
  DetailPageInsufficientCreditsDetail,
  DetailPagePersonalShapeSaveResult,
  DetailPagePromptEditResult,
  DetailPageReferenceImageUploadUrlResponse,
  DetailPageSectionReauthorResult,
  DetailPageShapeLibraryItem,
  DetailPageSvgPromptEditResult,
  DetailPageBrandReferenceItem,
} from "../../types/detail-page-api";
import type {
  Cafe24ProductDetailPayload,
  Cafe24ProductListPage,
  Cafe24ProductListParams,
  Cafe24ProductSummary,
  Cafe24RefreshParams,
  CoupangListingDetail,
  CoupangListingListPage,
  CoupangListListingsParams,
  NaverProductDetailPayload,
  NaverProductListPage,
  NaverProductListParams,
} from "../../types/commerce";

export type * from "../../types/detail-page-api";
export type * from "../../types/commerce";

/**
 * 소싱 서버.
 *
 * 이름 하나하나가 서버가 지켜야 하는 표면이다. base URL·인증·재시도·오류 변환은
 * 구현이 안다 — 편집기는 부르고 결과를 받을 뿐이다.
 */
export interface DetailPageHostApi {
  // ── 생성·재저작 ──
  reauthorDetailPageSection: (
    generatedId: string,
    payload: {
      label: string;
      instruction?: string;
      annotated_image?: string;
      reference_images?: (string | DesignReferenceInput)[];
      current_height?: number;
      template_id?: string;
    },
    signal?: AbortSignal,
  ) => Promise<DetailPageSectionReauthorResult>;
  encodeDetailPageAnimation: (
    frames: Blob[],
    options: { fps: number; format: "webp" | "gif" },
    signal?: AbortSignal,
  ) => Promise<Blob>;

  // ── 프롬프트 편집(카피·이미지·SVG·그룹) ──
  promptEditDetailPageCopy: (
    generatedId: string,
    payload: {
      slot_role: string;
      current_text: string;
      instruction: string;
      max_length?: number;
      render_kind?: string;
    },
    signal?: AbortSignal,
  ) => Promise<DetailPagePromptEditResult>;
  promptEditDetailPageImage: (
    generatedId: string,
    payload: {
      slot_role?: string;
      current_image_url?: string;
      current_image_base64?: string;
      instruction: string;
      annotated_image?: string;
      tier?: string;
      brand_id?: string;
    },
    signal?: AbortSignal,
  ) => Promise<DetailPageImageEditResult>;
  svgPromptEditDetailPage: (
    generatedId: string,
    payload: { slot_role?: string; current_svg: string; instruction: string },
    signal?: AbortSignal,
  ) => Promise<DetailPageSvgPromptEditResult>;
  groupPromptEditDetailPage: (
    generatedId: string,
    payload: { instruction: string; items: DetailPageGroupEditItem[] },
    signal?: AbortSignal,
  ) => Promise<DetailPageGroupPromptEditResult>;

  // ── 레퍼런스·저작물 ──
  analyzeDetailPageDesignReferences: (
    payload: {
      references: (string | DesignReferenceInput)[];
      instruction?: string;
    },
    signal?: AbortSignal,
  ) => Promise<DetailPageDesignBriefResult>;
  createDetailPageReferenceImageUploadUrl: (
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<DetailPageReferenceImageUploadUrlResponse>;
  listDetailPageBrandReferences: (
    params: { brand_id: string; limit?: number; cursor?: string },
    signal?: AbortSignal,
  ) => Promise<{
    items: DetailPageBrandReferenceItem[];
    next_cursor: string | null;
  }>;
  saveDetailPageAsBrandReference: (
    generatedId: string,
    payload: { brand_id: string; display_name?: string },
    signal?: AbortSignal,
  ) => Promise<{
    generated_id: string;
    brand_id: string;
    reference_group: string;
    display_name: string;
    assets: Record<string, unknown>[];
  }>;

  // ── 도형 라이브러리 ──
  listDetailPageShapeLibrary: (
    signal?: AbortSignal,
  ) => Promise<DetailPageShapeLibraryItem[]>;
  savePersonalDetailPageShape: (
    payload: { svg?: string; svg_base64?: string; origin?: string },
    signal?: AbortSignal,
  ) => Promise<DetailPagePersonalShapeSaveResult>;

  // ── 사용량·과금 오류 판별 ──
  //
  // 402/429 본문을 읽어 무엇이 부족한지 가리는 것은 **호스트의 일**이다. 편집기는
  // "부족하다더라" 를 화면에 옮길 뿐이라, 판별 함수를 주입받는다.
  getDetailPageEditUsage: (
    generatedId: string,
    signal?: AbortSignal,
  ) => Promise<DetailPageEditUsageResult>;
  asEditQuotaError: (err: unknown) => DetailPageEditQuotaDetail | null;
  asInsufficientCreditsError: (
    err: unknown,
  ) => DetailPageInsufficientCreditsDetail | null;
  /** 오류의 정체를 가릴 때 쓴다(`err instanceof host.api.SourcingApiError`). */
  SourcingApiError: new (
    message: string,
    status: number,
    detail?: unknown,
  ) => Error & { status: number; detail?: unknown };

  // ── 업로드 3루트 프리필(수동·카페24·네이버) ──
  fetchCafe24Products: (
    params?: Cafe24ProductListParams,
    signal?: AbortSignal,
  ) => Promise<Cafe24ProductListPage>;
  fetchCafe24ProductDetail: (
    productNo: number,
    signal?: AbortSignal,
    params?: Cafe24RefreshParams,
  ) => Promise<Cafe24ProductDetailPayload>;
  fetchCafe24ProductOptions: (
    productNo: number,
    shopNo?: number,
    signal?: AbortSignal,
    params?: Cafe24RefreshParams,
  ) => Promise<unknown>;
  fetchCafe24ProductCategories: (
    productNo: number,
    shopNo?: number,
    signal?: AbortSignal,
    params?: Cafe24RefreshParams,
  ) => Promise<unknown>;
  fetchNaverProducts: (
    params?: NaverProductListParams,
    signal?: AbortSignal,
  ) => Promise<NaverProductListPage>;
  fetchNaverProductDetail: (
    originProductNo: number,
    signal?: AbortSignal,
  ) => Promise<NaverProductDetailPayload>;
}

// ── 브랜드 저장소 ──────────────────────────────────────────────

export type BrandAssetKind =
  | "logo"
  | "font"
  | "image"
  | "product_image"
  | "model_image"
  | "document"
  | "svg"
  | "gif"
  | "other"
  | "shape";

export type BrandAssetGifKind = "shape" | "text" | "image_effect" | "image_prompt";

/** 목록 필터: GIF만 / GIF를 뺀 나머지만. */
export type BrandAssetMedia = "gif" | "image";

export interface BrandWorkspaceBrand {
  id: string;
  name: string;
  ownedCompanyId: string;
  revision: number;
}

export interface BrandAsset {
  id: string;
  brand_id: string;
  asset_type: BrandAssetKind;
  status:
    | "pending"
    | "completing"
    | "active"
    | "deleting"
    | "deleted"
    | "delete_failed";
  filename: string;
  display_name: string | null;
  content_type: string;
  size_bytes: number | null;
  s3_key: string;
  s3_etag: string | null;
  s3_version_id: string | null;
  download_url: string | null;
  /**
   * 만료 없는 서명 읽기 경로(API 베이스 상대). 편집기 문서처럼 오래 남는 곳에는
   * presigned URL(``download_url``) 대신 이걸 저장해야 나중에 403이 안 난다.
   */
  stable_path: string;
  gif_kind: BrandAssetGifKind | null;
  revision: number;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * 무드보드와 브랜드킷은 **편집기가 안을 안 본다**. 불러서 킷으로 바꾸고 브랜드킷
 * 슬롯(호스트가 꽂는 노드)에 그대로 넘길 뿐이다.
 *
 * 그래서 모양을 선언하지 않는다. 선언하면 오히려 깨진다 — `deriveBrandKit` 의 인자는
 * 반변이라, 우리가 `unknown` 으로 적으면 앱이 자기 `Moodboard` 를 받는 함수를 못 꽂고,
 * 좁게 적으면 이번엔 우리 호출부가 못 넘긴다. 나르기만 하는 값에 양방향으로 열린 타입을
 * 주는 것이 정직하다.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type BrandMoodboard = any;
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type BrandKit = any;

export interface DetailPageHostBrand {
  listBrandAssets: (
    brandId: string,
    signal?: AbortSignal,
    media?: BrandAssetMedia,
  ) => Promise<BrandAsset[]>;
  uploadBrandAsset: (
    brandId: string,
    file: File,
    assetType: BrandAssetKind,
    options?: {
      displayName?: string;
      metadata?: Record<string, unknown>;
      signal?: AbortSignal;
    },
  ) => Promise<BrandAsset>;
  deleteBrandAsset: (
    asset: Pick<BrandAsset, "id" | "brand_id" | "revision">,
    signal?: AbortSignal,
  ) => Promise<BrandAsset>;
  brandAssetDocumentSrc: (
    asset: Pick<BrandAsset, "stable_path" | "download_url">,
  ) => string;

  /** 어느 브랜드로 작업 중인가. 훅이라 컴포넌트 안에서만 부른다. */
  useBrandWorkspace: () => {
    brands: BrandWorkspaceBrand[];
    activeBrand: BrandWorkspaceBrand | null;
    activeBrandId: string | null;
    setActiveBrandId: (brandId: string) => void;
    isLoading: boolean;
    error: Error | null;
  };
  /** 훅을 못 쓰는 자리(모듈 함수)에서 활성 브랜드를 알아낼 때. */
  getStoredActiveBrandId: () => string | null;

  loadBrandMoodboard: (
    brand: BrandWorkspaceBrand,
    assets: BrandAsset[],
    signal?: AbortSignal,
  ) => Promise<BrandMoodboard>;
  deriveBrandKit: (moodboard: BrandMoodboard) => BrandKit;
  useBrandPrimaryColor: () => string;
}

// ── 상품 어댑터 ────────────────────────────────────────────────

/**
 * 프리필이 커머스 응답을 읽을 때만 쓴다.
 *
 * 정규화 함수를 주입받는 이유: 카페24 옵션·카테고리 응답은 계정마다 모양이 달라
 * 앱이 이미 방어적 정규화를 갖고 있다. 편집기가 그걸 다시 쓰면 두 벌이 갈라진다.
 */
export interface DetailPageHostProduct {
  getCafe24ProductNo: (product: Cafe24ProductSummary) => number;
  extractCafe24ProductCategories: (payload: unknown) => unknown[];
  extractCafe24ProductOptions: (payload: unknown) => unknown[];
  /** 쿠팡만 소싱 서버가 아니라 자체 클라이언트다. 편집기가 부르는 둘만 요구한다. */
  coupangApi: {
    listListings: (
      params: CoupangListListingsParams,
    ) => Promise<CoupangListingListPage>;
    getListing: (
      productNo: string,
      options?: { signal?: AbortSignal },
    ) => Promise<CoupangListingDetail>;
  };
}

// ── 알림 ──────────────────────────────────────────────────────

/**
 * 이건 부품이 아니라 **호스트의 것**이다. 토스트는 모듈 수준 싱글턴 저장소 + 화면
 * 구석의 오버레이 한 벌로 굴러가므로, 패키지가 자기 것을 동봉하면 소비자 앱에는
 * 토스터가 두 개 뜬다 — 편집기 알림만 다른 자리에 다른 모양으로 쌓인다.
 *
 * 반환값을 `void` 로 둔 것은 편집기가 토스트 id 를 안 쓰기 때문이다. 앱이 id 를
 * 돌려주는 구현을 꽂아도 그대로 들어온다.
 */
export interface DetailPageHostToast {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

// ── 캐시 키 ────────────────────────────────────────────────────

/**
 * 소비자가 자기 키 공간을 준다 — 안 그러면 같은 앱 안에서 편집기와 호스트가 서로의
 * 캐시를 무효화한다.
 */
export interface DetailPageHostQueryKeys {
  branding: {
    brandAssets: (
      brandId: string | null,
      media?: BrandAssetMedia,
    ) => readonly unknown[];
    brandMoodboard: (brandId: string | null) => readonly unknown[];
    detailPageShapeLibrary: () => readonly unknown[];
    detailPageStockPhotos: (query: string) => readonly unknown[];
    detailPageIcons: (
      query: string,
      group: string,
      style?: string,
    ) => readonly unknown[];
  };
}

// ── 앱 크롬 슬롯 ──────────────────────────────────────────────

/**
 * 편집기 **안에서 열리지만 편집기 것이 아닌** 화면.
 *
 * 요금제 모달은 크레딧이 모자랄 때 편집기가 열지만, 무엇을 얼마에 파는지는 앱이 안다.
 * 브랜드킷 패널도 마찬가지로 브랜드 도메인 화면이다. 그래서 컴포넌트를 받는다.
 *
 * 전부 옵셔널이다. 안 꽂으면 그 자리는 안 그려진다 — 요금제가 없는 소비자도 편집기를
 * 띄울 수 있어야 하고, "요금제 모달이 없다"가 편집기가 못 뜨는 이유가 되면 안 된다.
 */
export interface DetailPageHostSlots {
  PricingModal?: ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }>;
  BrandKitPanel?: ComponentType<{
    kit: BrandKit;
    store: never;
    className?: string;
  }>;
  /**
   * '내 이미지' 서랍의 두 번째 탭 — 저작이 구운 사진.
   *
   * 브랜드 자산과 한 그리드에 안 섞는 이유는 고르는 방식이 달라서다. 자산은 이름으로
   * 찾고, 저작 사진은 "그때 그 상세페이지"로 찾는다. 뒤쪽은 상세페이지 저작이라는 앱
   * 도메인을 알아야 묶이므로 앱이 꽂는다. 안 꽂으면 탭 없이 브랜드 자산만 뜬다.
   */
  AuthoredImagesPanel?: ComponentType<{ store: unknown }>;

  /**
   * 상단 헤더를 통째로 갈아 끼운다.
   *
   * 색·모서리는 토큰(`tokens.css`)으로 바꾸면 되지만, "무엇이 어디에 놓이는가" 는
   * 토큰이 못 바꾼다. 앱마다 헤더에 걸고 싶은 것이 다르므로 여기서 연다.
   *
   * 어려운 조각(되돌리기·내보내기 대화상자)은 만들어서 `parts` 로 넘긴다 — 그것까지
   * 다시 만들라고 하면 슬롯이 아니라 포크가 된다.
   */
  EditorHeader?: ComponentType<EditorHeaderSlotProps>;

  /**
   * 우측 인스펙터를 감싸거나 갈아 끼운다. 기본 인스펙터는 `defaultInspector` 로 온다 —
   * 자기 크롬만 두르고 속은 그대로 쓰는 것이 보통이다.
   */
  EditorInspector?: ComponentType<EditorInspectorSlotProps>;

  /**
   * 좌측 레일+패널 껍데기를 갈아 끼운다. 섹션 목록(탭·패널 컴포넌트)은 그대로 넘어가므로
   * 앱은 배치만 다시 짜면 된다.
   */
  EditorSidebar?: ComponentType<EditorSidebarSlotProps>;
}

/** 헤더 슬롯이 받는 것. */
export interface EditorHeaderSlotProps {
  /** 표시용 이름. 비어 있으면 편집기가 기본 문구를 채워서 준다. */
  productName: string;
  onBack?: () => void;
  save: {
    run: () => void;
    saving: boolean;
    /** 방금 저장됐다. 잠시 뒤 스스로 꺼진다. */
    ok: boolean;
    error: string | null;
  };
  /** 편집기가 만들어 주는 조각들. 자리만 정하면 된다. */
  parts: {
    history: ReactNode;
    download: ReactNode;
    /** 앱이 `headerActions` 로 넘긴 것(크레딧·알림·언어). */
    actions: ReactNode;
  };
}

/** 인스펙터 슬롯이 받는 것. */
export interface EditorInspectorSlotProps {
  store: unknown;
  defaultInspector: ReactNode;
}

/** 좌측 껍데기 슬롯이 받는 것. */
export interface EditorSidebarSlotProps {
  store: unknown;
  sections: ReadonlyArray<{
    name: string;
    Tab: ComponentType<Record<string, unknown>>;
    Panel: ComponentType<{ store: unknown }>;
    visibleInList?: boolean;
  }>;
  /** 처음 열어 둘 섹션 이름. */
  defaultSection: string;
}

export interface DetailPageHost {
  api: DetailPageHostApi;
  toast: DetailPageHostToast;
  brand: DetailPageHostBrand;
  product: DetailPageHostProduct;
  queryKeys: DetailPageHostQueryKeys;
  slots?: DetailPageHostSlots;
}

const DetailPageHostContext = createContext<DetailPageHost | null>(null);

export function DetailPageHostProvider({
  host,
  children,
}: {
  host: DetailPageHost;
  children: ReactNode;
}) {
  return (
    <DetailPageHostContext.Provider value={host}>
      {children}
    </DetailPageHostContext.Provider>
  );
}

/**
 * 편집기 안에서 바깥을 부를 때 쓴다.
 *
 * 없으면 던진다. 조용히 폴백을 만들면 "호스트를 안 꽂았다"는 사실이 런타임 한참
 * 뒤에야, 그것도 엉뚱한 증상으로 나타난다.
 */
export function useDetailPageHost(): DetailPageHost {
  const host = useContext(DetailPageHostContext);
  if (!host) {
    throw new Error(
      "DetailPageHostProvider 안에서만 쓸 수 있습니다. 편집기를 띄우는 화면에서 host를 꽂아 주세요.",
    );
  }
  return host;
}
