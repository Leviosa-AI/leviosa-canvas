/**
 * 사용 키 배선.
 *
 * 재는 것은 "키가 맞느냐"가 아니라 **키를 넣긴 하느냐**다. 배선이 빠져 있으면 아무도
 * 안 죽고 아무 경고도 안 나온다 — 그냥 계량기가 영원히 0을 가리킨다. 그게 이 테스트가
 * 있는 이유다(엔진 쪽 게이트 자체는 패키지의 license.test.ts가 잰다).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@leviosa-ai/canvas", () => ({
  configureCanvas: vi.fn(),
}));

import { configureCanvas } from "@leviosa-ai/canvas";

import { ensureCanvasKey } from "../canvas-key";

afterEach(() => {
  vi.clearAllMocks();
});

describe("ensureCanvasKey", () => {
  it("엔진에 키를 넘긴다", () => {
    ensureCanvasKey();
    expect(configureCanvas).toHaveBeenCalledWith({
      key: process.env.NEXT_PUBLIC_LEVIOSA_CANVAS_KEY,
    });
  });

  it("두 번 불러도 한 번만 설정한다 — 편집기를 여닫을 때마다 부른다", () => {
    ensureCanvasKey();
    ensureCanvasKey();
    expect(configureCanvas).not.toHaveBeenCalled();
  });
});
