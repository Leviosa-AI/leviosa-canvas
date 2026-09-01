import { describe, expect, it } from "vitest";

import { activeFramePages } from "../lib/detail-page/frame-pages";

const page = (id: string, frame?: string) => ({
  id,
  custom: frame === undefined ? undefined : { frame },
});

describe("activeFramePages", () => {
  // 지금까지 만들어진 문서에는 꼬리표가 없다. 목록이 한 줄도 잃으면 안 된다.
  it("꼬리표가 없으면 아무것도 안 거른다", () => {
    const pages = [page("p1"), page("p2")];
    expect(activeFramePages(pages, "p2")).toEqual(pages);
  });

  it("활성 페이지가 속한 벌만 남긴다", () => {
    const pages = [page("a1", "v1"), page("b1", "v2"), page("a2", "v1")];
    expect(activeFramePages(pages, "b1").map((one) => one.id)).toEqual(["b1"]);
    expect(activeFramePages(pages, "a2").map((one) => one.id)).toEqual([
      "a1",
      "a2",
    ]);
  });

  it("활성 페이지를 모르면 첫 벌을 쓴다", () => {
    const pages = [page("a1", "v1"), page("b1", "v2")];
    expect(activeFramePages(pages).map((one) => one.id)).toEqual(["a1"]);
    expect(activeFramePages(pages, "없는id").map((one) => one.id)).toEqual(["a1"]);
  });

  it("빈 문서는 빈 목록이다", () => {
    expect(activeFramePages([])).toEqual([]);
  });
});
