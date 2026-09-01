/**
 * 사용 키를 들고 있는 자리.
 *
 * 재는 것은 **아무것도 안 막는다**는 것이다 — 키가 없든 이상하든 편집기는 똑같이
 * 돈다. 한때 여기 붙어 있던 워터마크 판정은 없어졌다(license.ts 머리말).
 */

import { afterEach, describe, expect, it } from "vitest";

import { canvasKey, configureCanvas, resetCanvasConfig } from "../license";

afterEach(resetCanvasConfig);

describe("사용 키", () => {
  it("설정한 키를 들고 있는다", () => {
    configureCanvas({ key: "  lvc_abcdefghijklmnop  " });
    expect(canvasKey()).toBe("lvc_abcdefghijklmnop");
  });

  it("안 주면 비어 있다", () => {
    configureCanvas({});
    expect(canvasKey()).toBeNull();
  });

  it("이상한 키를 줘도 던지지 않는다", () => {
    expect(() => configureCanvas({ key: "nope" })).not.toThrow();
    expect(canvasKey()).toBe("nope");
  });
});
