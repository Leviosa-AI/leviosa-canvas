import { beforeEach, describe, expect, it } from "vitest";

import {
  detailPageEditorProfile,
  selectDetailPageEditorProfile,
} from "../editor-profile";

describe("편집기 설정표", () => {
  beforeEach(() => selectDetailPageEditorProfile({}));

  it("종류가 없는 옛 문서는 기존 상세페이지 설정을 쓴다", () => {
    expect(detailPageEditorProfile()).toEqual({
      page: { width: "document", height: "auto", fixed: false },
      maxPages: Number.POSITIVE_INFINITY,
      exports: ["png", "jpeg", "psd", "ai", "svg"],
      wording: "section",
    });
  });

  it("캐러셀 문서를 고정 판 설정으로 바꾼다", () => {
    selectDetailPageEditorProfile({ kind: "carousel" });

    expect(detailPageEditorProfile()).toEqual({
      page: { width: 1080, height: 1350, fixed: true },
      maxPages: 10,
      exports: ["jpeg"],
      wording: "plate",
    });
  });
});
