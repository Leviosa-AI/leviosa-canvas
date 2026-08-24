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
  wording: "section" | "plate";
};

const DETAIL_PAGE_PROFILE: DetailPageEditorProfile = {
  page: { width: "document", height: "auto", fixed: false },
  maxPages: Number.POSITIVE_INFINITY,
  exports: ["png", "jpeg", "psd", "ai", "svg"],
  wording: "section",
};

const CAROUSEL_PROFILE: DetailPageEditorProfile = {
  page: { width: 1080, height: 1350, fixed: true },
  maxPages: 10,
  exports: ["jpeg"],
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
