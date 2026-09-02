import { describe, expect, it } from "vitest";

import {
  EXPORT_PLATFORMS,
  exportPlatform,
  platformPixelRatio,
} from "../export-platforms";

describe("EXPORT_PLATFORMS", () => {
  it("모든 플랫폼이 움직이는 형식을 하나 이상 받고, 첫 항목이 기본이다", () => {
    for (const p of EXPORT_PLATFORMS) {
      expect(p.animation.length, p.value).toBeGreaterThan(0);
      expect(new Set(p.animation).size, p.value).toBe(p.animation.length);
    }
  });

  it("범용만 폭·용량 제한이 없고, 나머지는 양수다", () => {
    for (const p of EXPORT_PLATFORMS) {
      if (p.value === "general") {
        expect(p.width).toBeNull();
        expect(p.maxBytes).toBeNull();
        continue;
      }
      expect(p.width, p.value).toBeGreaterThan(0);
      expect(p.maxBytes, p.value).toBeGreaterThan(0);
    }
  });

  it("조사한 규격을 그대로 든다 — 네이버는 WebP 를 안 받고, 쿠팡은 GIF 를 안 받는다", () => {
    // 네이버: 모바일 미리보기가 WebP 를 못 그린다(스마트스토어센터 FAQ 15871).
    expect(exportPlatform("naver")?.animation).toEqual(["gif", "mp4"]);
    expect(exportPlatform("naver")?.width).toBe(860);
    // 쿠팡: GIF 업로드가 거부되고 WebP 는 올라간다(셀러 커뮤니티 보고).
    expect(exportPlatform("coupang")?.animation).toEqual(["webp"]);
    expect(exportPlatform("coupang")?.width).toBe(780);
    // 카페24: FTP 가 mp4 를 안 받는다.
    expect(exportPlatform("cafe24")?.animation).not.toContain("mp4");
  });

  it("모르는 값과 빈 값은 null", () => {
    expect(exportPlatform("amazon")).toBeNull();
    expect(exportPlatform(null)).toBeNull();
    expect(exportPlatform("")).toBeNull();
  });
});

describe("platformPixelRatio", () => {
  it("플랫폼 폭이 있으면 문서 폭을 그 폭으로 옮기는 배율이다", () => {
    expect(platformPixelRatio(exportPlatform("naver"), 750, 3)).toBeCloseTo(860 / 750);
    expect(platformPixelRatio(exportPlatform("kakao"), 750, 3)).toBe(1);
  });

  it("플랫폼 폭이 없으면 고른 해상도 배율을 그대로 쓴다", () => {
    expect(platformPixelRatio(exportPlatform("general"), 750, 3)).toBe(3);
    expect(platformPixelRatio(null, 750, 2)).toBe(2);
  });
});
