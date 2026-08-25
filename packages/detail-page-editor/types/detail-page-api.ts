/**
 * 편집기가 소싱 서버와 주고받는 모양.
 *
 * 이 타입들은 **편집기의 도메인**이다 — 상세페이지 판독 결과, 프롬프트 편집 결과,
 * 도형 라이브러리, 편집 한도. 그래서 정의가 여기 산다. 소싱 서버 클라이언트를 쓰는
 * 앱(leviosa-frontend)은 이걸 패키지에서 가져다 쓴다. 정의를 양쪽에 두면 그날부터
 * 갈라지므로, 옮긴 것이지 복제한 것이 아니다.
 *
 * 호출 **방법**(base URL·토큰·재시도)은 여기 없다. 그건 호스트가 안다 —
 * `components/detail-page/detail-page-host-context.tsx`.
 */

export interface DetailPagePersonalShapeItem {
  asset_id: string;
  svg: string;
  view_box: string;
  width: number;
  height: number;
  origin?: string;
  created_at?: string;
}

export type DetailPageReferenceImageUploadUrlResponse = Record<string, unknown>;

export interface DetailPagePromptEditResult {
  slot_role: string;
  text: string;
  edits_used?: number;
  edit_limit?: number;
}

export interface DetailPageSvgPromptEditResult {
  slot_role: string;
  svg: string;
  edits_used?: number;
  edit_limit?: number;
}

export interface DetailPageEditUsageResult {
  svg_used: number;
  svg_limit: number;
  text_used: number;
  text_limit: number;
  unlimited: boolean;
}

/** 편집 한도 초과(429) 오류 본문. 프론트 하드 차단 + 추가구매 안내에 사용. */
export interface DetailPageEditQuotaDetail {
  error: "edit_quota_exceeded";
  kind: "svg" | "text";
  used: number;
  limit: number;
}

/** 그룹 프롬프트 편집: 대상 요소 한 개(텍스트/도형/차트·표)의 입력 형태. */
export interface DetailPageGroupEditItem {
  id: string;
  kind: "text" | "svg" | "data";
  current_text?: string;
  current_svg?: string;
  slot_role?: string;
  render_kind?: string;
  max_length?: number;
  /**
   * 차트·표(``kind: "data"``)일 때의 스펙.
   *
   * 자식 글자가 아니라 스펙을 주고받는다 — 차트·표의 자식은 스펙에서 매번 다시
   * 그려지므로, 글자를 고쳐 받으면 다음 편집 한 번에 덮인다.
   */
  spec_kind?: "chart" | "table";
  current_spec?: unknown;
}

/** 그룹 프롬프트 편집 결과: 요소별 수정 결과. */
export interface DetailPageGroupEditResultItem {
  id: string;
  kind: "text" | "svg" | "data";
  text?: string | null;
  svg?: string | null;
  /** data일 때 수정된 스펙. 변경이 없으면 안 온다(원본 유지). */
  spec?: unknown;
}

export interface DetailPageGroupPromptEditResult {
  results: DetailPageGroupEditResultItem[];
  text_used: number;
  text_limit: number;
  svg_used: number;
  svg_limit: number;
}

/** 저작 사진을 브랜드 자산으로 승격한 결과. */
export interface DetailPagePromoteImageResult {
  asset_id: string;
  /**
   * 15분짜리 presigned. **문서에 박으면 안 된다** — 그 시간 뒤에 403 이 된다.
   * 문서에 남길 주소는 `stable_path` 다.
   */
  url?: string;
  /** 만료가 없는 서명 경로. 브랜드 라이브러리가 이 주소로 이 사진을 연다. */
  stable_path?: string;
  /** 같은 바이트가 이미 있어 새로 넣지 않았다는 뜻. */
  reused?: boolean;
}

export interface DetailPageImageEditResult {
  success: boolean;
  message?: string;
  slot_role?: string;
  asset_id?: string;
  url?: string;
  s3_key?: string;
  tier?: string;
  provider_model?: string;
  credit_feature?: string;
  credit_remaining?: number;
}

/** 크레딧 부족(402) 오류 본문. 프론트 부족 안내 + 추가구매 CTA에 사용. */
export interface DetailPageInsufficientCreditsDetail {
  error: "insufficient_credits";
  feature: string;
  remaining: number;
  message: string;
}

// --- 도형(SVG) 라이브러리 -----------------------------------------------------

/** 공용 도형 라이브러리 한 건(정적 카탈로그, 인라인 SVG 마크업). */
export interface DetailPageShapeLibraryItem {
  id: string;
  category: string;
  view_box: string;
  width: number;
  height: number;
  svg: string;
}

/** 도형 저장 결과(동일 도형은 duplicate=true로 기존 재사용). */
export interface DetailPagePersonalShapeSaveResult
  extends DetailPagePersonalShapeItem {
  success: boolean;
  message?: string;
  duplicate?: boolean;
}

/**
 * 레퍼런스 한 장 + 그 장에서 따라갈 축.
 *
 * ``aspects`` 는 닫힌 어휘다(palette · typography · layout · content · mood ·
 * decoration). 비우면 예전처럼 배치와 구성만 참고한다. ``content`` 는 문구가 아니라
 * **다루는 정보 항목과 순서**다.
 */
export interface DesignReferenceInput {
  url: string;
  aspects?: string[];
  note?: string;
}

/** 레퍼런스 판독 결과 — 설문이 이미 아는 어휘로 옮긴 것. 빈 값은 "모른다"다. */
export interface DetailPageDesignBrief {
  tone: string;
  density: string;
  bg_color: string;
  primary_colors: string[];
  typography: string;
  layout: string;
  /** 다루는 정보 항목과 순서 한 줄. 문구가 아니다. */
  content: string;
  summary: string;
  reference_count: number;
  aspects: string[][];
}

/** 판독 응답. 차감 크레딧은 화면이 셀러에게 되돌려 줘야 하는 숫자다. */
export interface DetailPageDesignBriefResult {
  brief: DetailPageDesignBrief;
  model: string;
  /** 차감한 크레딧(붙인 그림 크기로 정해짐). 과금이 꺼져 있으면 0. */
  credit_charged?: number;
  /** 차감 뒤 잔여 크레딧. 과금을 건너뛰었으면 -1. */
  credit_remaining?: number;
}

/** 브랜드 버킷에 저장해 둔 레퍼런스 자산 한 건. */
export interface DetailPageBrandReferenceItem {
  asset_id: string;
  url: string;
  /** 만료 없는 서명 경로. 문서에 박을 주소는 이쪽이어야 다시 열 때 403 이 안 난다. */
  stable_path: string;
  display_name: string;
  mime: string;
  created_at: string;
  /** screen(화면 캡쳐) | document(편집기 문서). 그림으로 걸 수 있는 것은 screen 뿐이다. */
  role: string;
  reference_group: string;
  reference_name: string;
  generated_id: string;
  template_id: string;
  screen_label: string;
  screen_index: number;
  screen_count: number;
}

/** 화면 재저작 결과: 갈아 끼울 Canvas 페이지 하나 + 규약 린트 리포트. */
export interface DetailPageSectionReauthorResult {
  label: string;
  page: Record<string, unknown>;
  lint_ok: boolean;
  lint_findings: Array<Record<string, unknown>>;
  rounds: number;
  text_used: number;
  text_limit: number;
}
