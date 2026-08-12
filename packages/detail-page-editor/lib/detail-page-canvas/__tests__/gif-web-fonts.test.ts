import { describe, expect, it } from "vitest";

import { resolveGifWebFonts } from "../gif-web-fonts";

const ORIGIN = "https://dev.leviosa.ai.kr";

describe("resolveGifWebFonts", () => {
  it("카탈로그 폰트는 굵기에 맞는 woff2 파일 주소를 준다", () => {
    const [font] = resolveGifWebFonts([{ family: "Paperozi", weight: 700 }], ORIGIN);
    expect(font.family).toBe("Paperozi");
    expect(font.weight).toBe(700);
    // 서버 허용 목록에 있는 호스트여야 실제로 주입된다.
    expect(font.url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\//);
    expect(font.url).toMatch(/\.woff2$/);
  });

  it("없는 굵기는 가장 가까운 굵기로 떨어진다", () => {
    const [font] = resolveGifWebFonts([{ family: "Paperozi", weight: 1000 }], ORIGIN);
    expect(font.weight).toBe(900);
  });

  it("번들 폰트는 우리 오리진의 스타일시트를 준다", () => {
    const [font] = resolveGifWebFonts(
      [{ family: "Nanum Myeongjo", weight: 700 }],
      ORIGIN,
    );
    expect(font.url.startsWith(`${ORIGIN}/render-fonts/family-css/`)).toBe(true);
    expect(font.url).toContain("nanum-myeongjo-700.css");
  });

  it("재배포 가능한 신규 폰트는 CDN 대신 우리 번들 스타일시트를 준다", () => {
    const [font] = resolveGifWebFonts([{ family: "Suit", weight: 500 }], ORIGIN);
    expect(font.url).toBe(
      `${ORIGIN}/render-fonts/family-css/suit-500.css?v=0.8.0`,
    );
  });

  it("재배포가 금지된 신규 폰트는 기존 CDN 파일을 유지한다", () => {
    const [font] = resolveGifWebFonts([{ family: "BookkMyungjo", weight: 400 }], ORIGIN);
    expect(font.url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\//);
    expect(font.url).toContain("BookkMyungjo-Lt.woff2");
  });

  it("http 오리진(로컬 개발)에서는 번들 폰트를 보내지 않는다", () => {
    // 서버가 어차피 거부한다 — 보내봐야 렌더만 느려진다.
    expect(
      resolveGifWebFonts(
        [{ family: "Nanum Myeongjo", weight: 400 }],
        "http://localhost:3000",
      ),
    ).toEqual([]);
  });

  it("카탈로그에 없는 family(문서 레거시 이름)는 건너뛴다", () => {
    expect(
      resolveGifWebFonts([{ family: "존재하지않는폰트", weight: 400 }], ORIGIN),
    ).toEqual([]);
  });

  it("같은 family+굵기는 한 번만 담는다", () => {
    const fonts = resolveGifWebFonts(
      [
        { family: "Paperozi", weight: 700 },
        { family: "Paperozi", weight: 700 },
        { family: "Paperozi", weight: 400 },
      ],
      ORIGIN,
    );
    expect(fonts).toHaveLength(2);
  });

  it("빈 family는 무시한다", () => {
    expect(resolveGifWebFonts([{ family: "", weight: 400 }], ORIGIN)).toEqual([]);
  });
});
