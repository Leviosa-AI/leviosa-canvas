// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { describe, expect, it } from "vitest";

import { canvasLimits, exceededCanvasLimit } from "../canvas-limits";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0";
const IPADOS = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0";

describe("canvasLimits", () => {
  it("데스크톱 Chrome 은 860×34,965 를 한 장으로 그린다", () => {
    expect(exceededCanvasLimit(860, 34_965, canvasLimits(CHROME, 0))).toBeNull();
  });

  it("Firefox 는 한 변 32,767 을 넘으면 막는다", () => {
    expect(exceededCanvasLimit(860, 34_965, canvasLimits(FIREFOX, 0))).toBe(32_767);
  });

  it("터치 지점이 있는 Macintosh 는 iPadOS 로 보고 넓이를 막는다", () => {
    expect(exceededCanvasLimit(860, 34_965, canvasLimits(IPADOS, 5))).toBe(16_777_216);
    expect(exceededCanvasLimit(860, 34_965, canvasLimits(IPADOS, 0))).toBeNull();
  });
});
