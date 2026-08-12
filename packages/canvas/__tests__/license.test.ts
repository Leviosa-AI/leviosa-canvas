/**
 * 사용 키 게이트.
 *
 * 재는 것은 "막느냐"가 아니라 **안 막느냐**다. 이 게이트가 잘못 켜지면 우리 산출물에
 * 워터마크가 박히고, 그건 키가 새는 것보다 훨씬 비싸다(license.ts 규칙 2·3).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { configureCanvas, resetCanvasConfig, shouldWatermark } from "../license";

function atOrigin(origin: string | null) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { origin },
  });
}

afterEach(() => {
  resetCanvasConfig();
  vi.restoreAllMocks();
});

describe("우리 자리에서는 안 찍는다", () => {
  it.each([
    "https://leviosa.ai.kr",
    "https://dev.leviosa.ai.kr",
    "https://agency.leviosa.ai.kr",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
  ])("%s — 키 없이도 통과", (origin) => {
    atOrigin(origin);
    expect(shouldWatermark()).toBe(false);
  });

  it("오리진을 못 읽으면 통과한다 — 헤드리스 렌더러가 여기 걸린다", () => {
    atOrigin(null);
    expect(shouldWatermark()).toBe(false);
    atOrigin("null");
    expect(shouldWatermark()).toBe(false);
  });
});

describe("남의 자리에서는 키를 본다", () => {
  it("키가 없으면 찍고, 경고는 한 번만 한다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    atOrigin("https://someone-else.example");
    expect(shouldWatermark()).toBe(true);
    expect(shouldWatermark()).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("모양이 맞는 키면 안 찍는다", () => {
    atOrigin("https://someone-else.example");
    configureCanvas({ key: "lvc_0123456789abcdef" });
    expect(shouldWatermark()).toBe(false);
  });

  it("모양이 틀린 키는 없는 것과 같다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    atOrigin("https://someone-else.example");
    for (const key of ["", "   ", "lvc_short", "abcdef0123456789"]) {
      configureCanvas({ key });
      expect(shouldWatermark()).toBe(true);
    }
  });
});
