"use client";

/**
 * `DetailPageHost` — 셸이 바깥 세상과 만나는 **유일한 자리**.
 *
 * 편집기 셸이 앱에 물린 자리 중 데이터 접근이 여기로 모인다(`shell-boundary.test.ts`의
 * `inject` 버킷). 소싱 서버 호출, 브랜드 저장소, react-query 캐시 키, 상품 어댑터.
 * 그걸 인터페이스 **하나**로 모으면 소비자가 자기 base URL·토큰·캐시 키를 꽂는다 —
 * 그게 "프론트 라이브러리만 설치하고 백엔드는 카페24 소싱 서버를 계속 쓴다"는 구상이
 * 성립하는 방식이다.
 *
 * ## 왜 `typeof`인가
 *
 * 각 멤버의 타입을 손으로 다시 적으면 그날부터 앱 구현과 갈라진다. 이름만 고르고
 * 시그니처는 앱 모듈에서 그대로 끌어오면 드리프트가 0이고, 이름이 사라지면 tsc가
 * 즉시 죽는다. **이름 목록이 곧 계약이다.**
 *
 * 패키지로 나갈 때(4단계) 이 파일은 손으로 쓴 인터페이스가 되는데, 그때 적을 것은
 * 이미 여기 다 열거돼 있다. 그 이름들이 소싱 서버가 지켜야 하는 표면이기도 하다.
 *
 * ## 이사는 끝났다
 *
 * 주입 버킷 55건이 **11건**이 됐고, 그 11건이 전부 이 파일이다 — 아래 `import type`
 * 열한 줄. 셸의 호출부는 한 곳도 앱 모듈을 직접 안 부른다. 경계 테스트가 모듈당 1을
 * 못 넘게 지키므로, 숫자가 2가 되는 순간 그건 새로 박힌 자리다.
 *
 * 훅을 못 쓰는 자리(순수 함수 모듈)는 호출부가 `DetailPageHost`를 인자로 넘긴다 —
 * `product-source.ts`·`gif-export.ts`·`reference-upload.ts`가 그 모양이다.
 */

import { createContext, useContext, type ReactNode } from "react";

/**
 * 이름공간을 **타입으로만** 들여온다.
 *
 * `typeof import("...")`를 자리마다 쓰지 않고 한 줄로 묶은 이유는, 값 계약(`Pick<typeof …>`)과
 * 타입 계약(응답 모양)이 같은 문에서 나와야 셸이 소싱 서버에 물린 자리가 **정확히 하나**로
 * 유지되기 때문이다. 번들에는 아무것도 안 실린다.
 */
import type * as SourcingApi from "@/lib/sourcing-api";
import type * as BrandAssetApi from "@/lib/branding/brand-asset-api";
import type * as BrandWorkspace from "@/lib/branding/brand-workspace";
import type * as BrandKit from "@/lib/branding/brand-kit";
import type * as BrandMoodboard from "@/lib/branding/brand-moodboard-data";
import type * as BrandPrimaryColor from "@/lib/branding/use-brand-primary-color";
import type * as ProductsUtils from "@/lib/products-utils";
import type * as Cafe24Normalizers from "@/lib/cafe24-commerce-normalizers";
import type * as CoupangApi from "@/lib/coupang-api";
import type * as QueryKeys from "@/lib/query-keys";
import type * as Cafe24Commerce from "@/types/cafe24-commerce";
import type * as Toast from "@/components/ui/toast";

/**
 * 소싱 서버가 주고받는 모양.
 *
 * 함수만 주입하고 타입은 각자 앱에서 가져오게 두면, 결국 셸의 모든 패널이 다시
 * `@/lib/sourcing-api`를 부른다 — 그러면 주입한 의미가 없다.
 */
export type DetailPageDesignBrief = SourcingApi.DetailPageDesignBrief;
export type DetailPageShapeLibraryItem = SourcingApi.DetailPageShapeLibraryItem;
export type DetailPageBrandReferenceItem = SourcingApi.DetailPageBrandReferenceItem;
export type DetailPageGroupEditItem = SourcingApi.DetailPageGroupEditItem;
export type DetailPageGroupEditResultItem = SourcingApi.DetailPageGroupEditResultItem;

/** 소싱 서버. base URL·인증·재시도는 구현이 안다. */
export type DetailPageHostApi = Pick<
  typeof SourcingApi,
  // 생성·재저작
  | "reauthorDetailPageSection"
  | "encodeDetailPageAnimation"
  // 프롬프트 편집(카피·이미지·SVG·그룹)
  | "promptEditDetailPageCopy"
  | "promptEditDetailPageImage"
  | "svgPromptEditDetailPage"
  | "groupPromptEditDetailPage"
  // 레퍼런스·저작물
  | "analyzeDetailPageDesignReferences"
  | "createDetailPageReferenceImageUploadUrl"
  | "listDetailPageBrandReferences"
  | "saveDetailPageAsBrandReference"
  // 도형 라이브러리
  | "listDetailPageShapeLibrary"
  | "savePersonalDetailPageShape"
  // 사용량·과금 오류 판별
  | "getDetailPageEditUsage"
  | "asEditQuotaError"
  | "asInsufficientCreditsError"
  | "SourcingApiError"
  // 업로드 3루트 프리필(수동·카페24·네이버)
  | "fetchCafe24Products"
  | "fetchCafe24ProductDetail"
  | "fetchCafe24ProductOptions"
  | "fetchCafe24ProductCategories"
  | "fetchNaverProducts"
  | "fetchNaverProductDetail"
>;

/** 브랜드 저장소가 주고받는 모양. */
export type BrandAsset = BrandAssetApi.BrandAsset;
export type BrandAssetKind = BrandAssetApi.BrandAssetKind;
export type BrandAssetGifKind = BrandAssetApi.BrandAssetGifKind;

/** 브랜드 저장소. 자산 바이트와 워크스페이스 선택. */
export type DetailPageHostBrand = Pick<
  typeof BrandAssetApi,
  | "listBrandAssets"
  | "uploadBrandAsset"
  | "deleteBrandAsset"
  | "brandAssetDocumentSrc"
> &
  Pick<typeof BrandWorkspace, "useBrandWorkspace" | "getStoredActiveBrandId"> &
  Pick<typeof BrandKit, "deriveBrandKit"> &
  Pick<typeof BrandMoodboard, "loadBrandMoodboard"> &
  Pick<typeof BrandPrimaryColor, "useBrandPrimaryColor">;

/** 목록 필터 플래그(진열·판매). 카페24만 쓴다. */
export type Cafe24Flag = Cafe24Commerce.Cafe24Flag;

/** 상품 어댑터. 프리필이 카페24·쿠팡 응답을 읽을 때만 쓴다. */
export type DetailPageHostProduct = Pick<typeof ProductsUtils, "getCafe24ProductNo"> &
  Pick<
    typeof Cafe24Normalizers,
    "extractCafe24ProductCategories" | "extractCafe24ProductOptions"
  > &
  {
    /** 쿠팡은 소싱 서버가 아니라 자체 클라이언트다. 셸이 부르는 둘만 요구한다. */
    coupangApi: Pick<typeof CoupangApi.coupangApi, "listListings" | "getListing">;
  };

/**
 * 알림.
 *
 * 이건 부품이 아니라 **호스트의 것**이다. 토스트는 모듈 수준 싱글턴 저장소 + 화면
 * 구석의 `Toaster` 한 벌로 굴러가므로, 패키지가 자기 것을 동봉하면 소비자 앱에는
 * 토스터가 두 개 뜬다 — 편집기 알림만 다른 자리에 다른 모양으로 쌓인다.
 * 셸이 쓰는 것은 세 가지뿐이라 호스트가 자기 알림 통로를 주면 된다.
 */
export type DetailPageHostToast = Pick<typeof Toast.toast, "success" | "error" | "info">;

export type DetailPageHost = {
  api: DetailPageHostApi;
  toast: DetailPageHostToast;
  brand: DetailPageHostBrand;
  product: DetailPageHostProduct;
  /**
   * react-query 캐시 키. 소비자가 자기 키 공간을 준다 — 안 그러면 같은 앱 안에서
   * 편집기와 호스트가 서로의 캐시를 무효화한다.
   */
  queryKeys: typeof QueryKeys.queryKeys;
};

const DetailPageHostContext = createContext<DetailPageHost | null>(null);

export function DetailPageHostProvider({
  host,
  children,
}: {
  host: DetailPageHost;
  children: ReactNode;
}) {
  return (
    <DetailPageHostContext.Provider value={host}>{children}</DetailPageHostContext.Provider>
  );
}

/**
 * 셸 안에서 바깥을 부를 때 쓴다.
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
