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
      registerPlatform: true,
      wording: "section",
    });
  });

  it("캐러셀 문서를 고정 판 설정으로 바꾼다", () => {
    selectDetailPageEditorProfile({ kind: "carousel" });

    expect(detailPageEditorProfile()).toEqual({
      page: { width: 1080, height: 1350, fixed: true },
      maxPages: 10,
      // 형식은 상세페이지와 같다. 다른 것은 기본값(첫 항목)이 JPG 라는 것과,
      // 인스타그램 한 곳으로만 나가므로 등록 플랫폼을 안 묻는다는 것뿐이다.
      exports: ["jpeg", "png", "psd", "ai", "svg"],
      registerPlatform: false,
      wording: "plate",
    });
  });
});
