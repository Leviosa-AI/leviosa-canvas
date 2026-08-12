import { describe, expect, it } from "vitest";

import { toHexColor } from "../css-color";

describe("toHexColor", () => {
  it("folds the rgb() form Canvas returns from el.fill", () => {
    // 이 형태가 그대로 백엔드로 나가 422(String should have at most 9 characters)를 냈다.
    expect(toHexColor("rgb(23, 21, 15)", "#26221e")).toBe("#17150f");
    expect(toHexColor("RGB(255,255,255)", "#26221e")).toBe("#ffffff");
  });

  it("keeps alpha only when it is not fully opaque", () => {
    expect(toHexColor("rgba(23, 21, 15, 1)", "#26221e")).toBe("#17150f");
    expect(toHexColor("rgba(23, 21, 15, 0.5)", "#26221e")).toBe("#17150f80");
    expect(toHexColor("rgba(0, 0, 0, 0)", "#26221e")).toBe("#00000000");
  });

  it("passes hex through, lowercased and trimmed", () => {
    expect(toHexColor("#17150F", "#26221e")).toBe("#17150f");
    expect(toHexColor("  #abc  ", "#26221e")).toBe("#abc");
    expect(toHexColor("#17150f80", "#26221e")).toBe("#17150f80");
  });

  it("falls back for anything it cannot fold", () => {
    // 백엔드에서 422를 맞느니 기본색으로 보내는 편이 낫다.
    expect(toHexColor("linear-gradient(90deg, #fff, #000)", "#26221e")).toBe(
      "#26221e",
    );
    expect(toHexColor("rgb(300, 0, 0)", "#26221e")).toBe("#26221e");
    expect(toHexColor("red", "#26221e")).toBe("#26221e");
    expect(toHexColor(undefined, "#ffffff")).toBe("#ffffff");
    expect(toHexColor(null, "#ffffff")).toBe("#ffffff");
  });

  it("never returns something longer than the backend's 9-char cap", () => {
    for (const raw of [
      "rgb(23, 21, 15)",
      "rgba(23, 21, 15, 0.5)",
      "#17150f80",
      "#abcd",
    ]) {
      expect(toHexColor(raw, "#26221e").length).toBeLessThanOrEqual(9);
    }
  });
});
