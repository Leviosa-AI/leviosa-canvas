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

/** 편집기 입구에서 고른 설정표. 안쪽 코드는 문서 종류 대신 이 값만 읽는다. */
export function detailPageEditorProfile(): DetailPageEditorProfile {
  return DETAIL_PAGE_PROFILE;
}
