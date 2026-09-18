// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
// @vitest-environment node
import "./check-font-urls.test.mjs";
import "./gen-font-css.test.mjs";

import { describe, expect, it } from "vitest";

import { fontLoadSampleForText } from "../fonts/font-coverage";

describe("fontLoadSampleForText", () => {
  it("uses only characters a Latin-only font can match", () => {
    expect(fontLoadSampleForText("Playfair Display", "한글 Sale 50%"))
      .toBe("Sale50");
    expect(fontLoadSampleForText("Playfair Display", "한글", "가Aa1"))
      .toBe("Aa1");
  });

  it("keeps Hangul for a Korean font", () => {
    expect(fontLoadSampleForText("Pretendard", "한글 Sale"))
      .toBe("한글 Sale");
  });
});
