/**
 * 고른 스톡 사진의 **바이트**는 브라우저가 직접 받는다(`fetchStockPhotoFile`).
 *
 * `img-src`는 `https:` 전체라 썸네일은 늘 멀쩡하고, 막히는 건 그 fetch 하나뿐이다 —
 * 그래서 증상이 "검색은 되는데 넣기만 안 됨"으로 나타나 CSP가 원인으로 안 보인다.
 * 여기서 못 박아 둔다.
 */

import { describe, expect, it } from "vitest";

import nextConfig from "../../../../next.config";

async function directive(name: string): Promise<string> {
  const groups = (await nextConfig.headers?.()) ?? [];
  const csp =
    groups
      .flatMap((group) => group.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value ?? "";
  return (
    csp
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name} `)) ?? ""
  );
}

describe("스톡 사진 CSP", () => {
  it("connect-src가 Pexels 이미지 호스트를 허용한다", async () => {
    expect(await directive("connect-src")).toContain("https://images.pexels.com");
  });

  it("img-src만으로는 부족하다 — 받는 건 fetch다", async () => {
    // img-src 는 https: 전체를 열어 두므로 썸네일은 어차피 통과한다.
    // 이 테스트가 지키는 건 위 한 줄이지 이 줄이 아니다.
    expect(await directive("img-src")).toContain("https:");
  });
});
