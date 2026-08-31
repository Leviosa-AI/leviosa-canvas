import type { LeviosaCanvasDocument } from "../../types/detail-page-canvas";

export type DetailPageEditorFormat = "png" | "jpeg" | "psd" | "svg" | "ai";

export type DetailPageEditorProfile = {
  page: {
    width: "document" | number;
    height: "auto" | number;
    fixed: boolean;
  };
  maxPages: number;
  exports: readonly DetailPageEditorFormat[];
  /**
   * 다운로드 팝오버에 "등록 플랫폼"을 물어볼지. 그 답은 파일명 접미사에만 쓰이고,
   * 셀러가 상품을 어디에 올릴지 고르며 맥락을 잡으라고 있는 것이다. 캐러셀은
   * 인스타그램 한 곳으로 나가므로 물어볼 것이 없다 — 고를 수 없는 선택지를
   * 남겨 두면 접미사만 거짓말을 한다(`-naver` 붙은 인스타 이미지).
   */
  registerPlatform: boolean;
  wording: "section" | "plate";
};

const DETAIL_PAGE_PROFILE: DetailPageEditorProfile = {
  page: { width: "document", height: "auto", fixed: false },
  maxPages: Number.POSITIVE_INFINITY,
  exports: ["png", "jpeg", "psd", "ai", "svg"],
  registerPlatform: true,
  wording: "section",
};

const CAROUSEL_PROFILE: DetailPageEditorProfile = {
  page: { width: 1080, height: 1350, fixed: true },
  maxPages: 10,
  // 상세페이지와 같은 다섯 가지다. 한때 JPG 하나로 좁혀 뒀던 것은 인스타그램이
  // JPG 로 받는다는 이유였는데, 내보낸 파일이 곧장 업로드로만 가는 것이 아니다 —
  // 투명 배경을 살리려면 PNG 가, 다른 도구로 넘겨 손보려면 PSD·AI·SVG 가 필요하다.
  // 첫 항목이 기본값이므로 JPG 를 앞에 둬서 지금까지의 기본 동작은 그대로 둔다.
  exports: ["jpeg", "png", "psd", "ai", "svg"],
  registerPlatform: false,
  wording: "plate",
};

let current = DETAIL_PAGE_PROFILE;

/** 문서 종류를 읽는 유일한 자리. 종류가 없으면 기존 상세페이지 설정을 쓴다. */
export function selectDetailPageEditorProfile(
  document: Pick<LeviosaCanvasDocument, "kind">,
): DetailPageEditorProfile {
  current = document.kind === "carousel" ? CAROUSEL_PROFILE : DETAIL_PAGE_PROFILE;
  return current;
}

/** 편집기 입구에서 고른 설정표. 안쪽 코드는 문서 종류 대신 이 값만 읽는다. */
export function detailPageEditorProfile(): DetailPageEditorProfile {
  return current;
}
