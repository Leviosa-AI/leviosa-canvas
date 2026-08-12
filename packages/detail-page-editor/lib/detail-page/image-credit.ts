// 편집기 AI 이미지(개인 생성 / 우측 실시간 편집) 크레딧 게이트 유틸.
//
// 백엔드는 잔액을 못 읽어 원자적 decrement가 <1배에서만 실패한다. 안정성을 위한
// 1.5배 안전 마진은 프론트가 생성 전 soft 게이트로 건다(잔액 < 1.5×비용이면 차단).
// 티어별 feature 키는 백엔드 config 기본값과 일치해야 하며, 실제 단가는 중앙
// Supabase feature_costs에서 읽는다(useCredits). 단가 0(미구성)이면 게이트 비활성.

export const IMAGE_CREDIT_MULTIPLIER = 1.5;
export const DEFAULT_IMAGE_TIER: ImageTier = "pro";

export type ImageTier = "basic" | "pro" | "max";

/** 선택 UI에 노출할 티어 순서(저→고 품질). */
export const IMAGE_TIERS: ImageTier[] = ["basic", "pro", "max"];

export const IMAGE_FEATURE_KEYS: Record<ImageTier, string> = {
  basic: "detail_page_image_basic",
  pro: "detail_page_image_pro",
  max: "detail_page_image_max",
};

/**
 * AI GIF 생성 feature 키(백엔드 `DETAIL_PAGE_GIF_FEATURE` 기본값과 일치해야 함).
 * 단가는 feature_costs에서 읽으며 현재 50크레딧으로 등록.
 */
export const GIF_FEATURE_KEY = "detail_page_gif";

/**
 * 텍스트→GIF 이펙트 feature 키(백엔드 `DETAIL_PAGE_TEXT_GIF_FEATURE` 기본값과 일치).
 * 헤드리스 렌더라 원가 ~0이라 basic 이미지 티어급 소액(5크레딧)으로 feature_costs 등록.
 */
export const TEXT_GIF_FEATURE_KEY = "detail_page_text_gif";

/**
 * 이미지→GIF 이펙트 feature 키(백엔드 `DETAIL_PAGE_IMAGE_GIF_FEATURE` 기본값과 일치).
 * PIL 프레임 합성이라 AI 원가는 없지만, 홀로그램 포일은 물체 검출(배경제거) 1콜이
 * 붙으므로 텍스트 GIF보다 높게 feature_costs에 등록한다.
 */
export const IMAGE_GIF_FEATURE_KEY = "detail_page_image_gif";

/**
 * 수치→GIF(카운트업·셀 차오름) feature 키(백엔드 `DETAIL_PAGE_DATA_GIF_FEATURE` 기본값과
 * 일치). 텍스트 GIF와 **같은 렌더러**라 원가가 같아 단가도 5크레딧으로 맞췄다.
 */
export const DATA_GIF_FEATURE_KEY = "detail_page_data_gif";

/**
 * 배경 제거(누끼) feature 키(백엔드 `DETAIL_PAGE_BG_REMOVE_FEATURE` 기본값과 일치).
 * 배경제거 모델 1콜이 전부라 이미지 생성보다 훨씬 싸고, 홀로그램 포일이 쓰는 컷아웃
 * 캐시를 공유해 같은 이미지를 다시 눌러도 모델 왕복이 없다. 1크레딧으로 등록.
 */
export const BG_REMOVE_FEATURE_KEY = "detail_page_bg_remove";

/**
 * 티어별 표시 메타. 모델·품질 설명은 백엔드 `_TIER_MODEL_CONFIG`와 일치해야 한다:
 * basic=chatgpt-image-latest/low, pro(기본)=chatgpt-image-latest/medium,
 * max=gpt-image-2/high.
 */
export const IMAGE_TIER_META: Record<
  ImageTier,
  {
    /** 드롭다운에 보이는 짧은 이름. */
    label: string;
    /** 한 줄 품질 요약. */
    quality: string;
    /** 툴팁 상세(속도·용도 트레이드오프). */
    description: string;
    /** 배지/추천 표기(선택). */
    badge?: string;
    /**
     * 라이브 단가(feature_costs)를 못 읽는 데모(dev-canvas)에서 쓰는 대체 단가.
     * 실제 편집기는 useCredits의 getCost로 덮어쓴다. 값은 중앙 feature_costs와
     * 맞춰야 한다(2026-07-20: 5 / 20 / 70).
     */
    fallbackCost: number;
  }
> = {
  basic: {
    label: "베이직",
    quality: "빠르고 저렴 · 기본 품질",
    description:
      "가장 빠르고 저렴해요. 초안·썸네일처럼 가볍게 여러 장 시도할 때 좋아요. (저화질)",
    fallbackCost: 5,
  },
  pro: {
    label: "프로",
    quality: "권장 · 균형잡힌 품질/속도",
    description:
      "품질과 속도의 균형이 가장 좋아 기본값으로 권장해요. 대부분의 상세페이지 컷에 적합합니다. (중화질)",
    badge: "추천",
    fallbackCost: 20,
  },
  max: {
    label: "맥스",
    quality: "최고 품질 · 느리고 비쌈",
    description:
      "가장 정교한 최고 화질이지만 생성이 느리고 크레딧이 많이 들어요. 최종 확정 컷에만 쓰는 걸 권장해요. (고화질)",
    fallbackCost: 70,
  },
};

export function imageFeatureKey(tier?: string): string {
  return IMAGE_FEATURE_KEYS[(tier as ImageTier) ?? DEFAULT_IMAGE_TIER] ?? IMAGE_FEATURE_KEYS.pro;
}

/** 데모(라이브 단가 미주입)에서 쓸 티어별 대체 단가 맵. */
export const IMAGE_TIER_FALLBACK_COST: Record<ImageTier, number> = {
  basic: IMAGE_TIER_META.basic.fallbackCost,
  pro: IMAGE_TIER_META.pro.fallbackCost,
  max: IMAGE_TIER_META.max.fallbackCost,
};

/** 생성/편집에 필요한 최소 보유 크레딧(비용의 1.5배, 올림). */
export function imageCreditRequired(cost: number): number {
  return Math.ceil(Math.max(0, cost) * IMAGE_CREDIT_MULTIPLIER);
}

/** 잔액이 1.5배 미만이면 차단. 비용 0(미구성)이면 항상 허용. */
export function isImageCreditBlocked(cost: number, balance: number): boolean {
  return cost > 0 && balance < imageCreditRequired(cost);
}
