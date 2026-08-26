import { describe, expect, it } from "vitest";

import {
  isAuthoringImageSrc,
  parseAuthoringImageSrc,
} from "../authoring-image-src";

/**
 * 저작 사진만 브랜드로 승격할 수 있고, 승격에는 주소가 이미 들고 있는
 * (잡, 이름, 서명) 셋이 그대로 필요하다. 편집기가 가진 것은 `el.src` 뿐이라 버튼을
 * 띄울지 말지도 이 파싱 하나로 정해진다.
 */
describe("parseAuthoringImageSrc", () => {
  const SIGNED =
    "/api/v2/detail-pages/brand-authoring/job-1/images/hero.png?sig=abc123";

  it("저작 사진 주소를 셋으로 쪼갠다", () => {
    expect(parseAuthoringImageSrc(SIGNED)).toEqual({
      jobId: "job-1",
      name: "hero.png",
      sig: "abc123",
    });
  });

  it("절대 주소로 와도, 호스트가 무엇이든 같다", () => {
    // 상세페이지 서버가 소싱에서 갈라져 나오면서 저작 사진의 호스트가 바뀐다.
    // 파싱이 경로와 질의만 본다는 것이 그 이관의 전제라, 호스트를 표로 둔다 —
    // 여기에 호스트 판정이 생기면 컷오버 당일 승격 버튼이 조용히 사라진다.
    for (const origin of [
      "https://cafe24.sourcing.leviosa.ai.kr", // 갈라지기 전
      "https://detail-page.leviosa.ai.kr", // 갈라진 뒤
      "https://dev.leviosa.ai.kr", // 같은 출처 프록시 경유
    ]) {
      expect(parseAuthoringImageSrc(`${origin}${SIGNED}`)).toEqual({
        jobId: "job-1",
        name: "hero.png",
        sig: "abc123",
      });
    }
  });

  it("이름의 퍼센트 인코딩을 푼다", () => {
    expect(
      parseAuthoringImageSrc(
        "/api/v2/detail-pages/brand-authoring/j1/images/%EC%A0%9C%ED%92%88%EC%BB%B7.png?sig=s",
      )?.name,
    ).toBe("제품컷.png");
  });

  it("서명이 없으면 저작 사진으로 안 본다", () => {
    // 반쪽짜리를 넘기면 서버는 404 로 돌려보내는데, 버튼은 이미 눌린 뒤라
    // 셀러에게는 "저장이 실패했다"로 보인다.
    expect(
      parseAuthoringImageSrc(
        "/api/v2/detail-pages/brand-authoring/job-1/images/hero.png",
      ),
    ).toBeNull();
  });

  it("폴링·고르기 경로는 걸리지 않는다", () => {
    expect(
      parseAuthoringImageSrc("/api/v2/detail-pages/brand-authoring/job-1?sig=s"),
    ).toBeNull();
    expect(
      parseAuthoringImageSrc(
        "/api/v2/detail-pages/brand-authoring/job-1/select?sig=s",
      ),
    ).toBeNull();
  });

  it("저작이 만들지 않은 사진은 전부 아니다", () => {
    // 셀러가 올린 것·브랜드에서 가져온 것·이미 브랜드에 들어간 AI 이미지는
    // 승격할 이유가 없고, 실제로 이 모양이 아니다.
    for (const src of [
      "",
      "data:image/png;base64,iVBOR",
      "blob:https://app.leviosa.ai.kr/9f2",
      "/api/v1/brands/assets/file/a1?sig=s",
      "https://bucket.s3.ap-northeast-2.amazonaws.com/x.png?X-Amz-Signature=s",
      "/static/placeholder.png",
    ]) {
      expect(parseAuthoringImageSrc(src)).toBeNull();
    }
  });

  it("isAuthoringImageSrc 는 같은 판단을 참·거짓으로만 답한다", () => {
    expect(isAuthoringImageSrc(SIGNED)).toBe(true);
    expect(isAuthoringImageSrc("/static/placeholder.png")).toBe(false);
  });
});
