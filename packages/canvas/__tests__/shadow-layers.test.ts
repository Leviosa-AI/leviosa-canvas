import { describe, expect, it } from "vitest";
import { parseCssShadow } from "../paint/konva-fallback";

/**
 * 겹을 안 끊으면 첫 겹의 마지막 값에 쉼표가 붙어(`26px,`) 「숫자px」 꼴이 아니게 되고,
 * 흐림이 0 으로 떨어진다 — 그림자가 아니라 색판이 밀려 나온 모양이 된다.
 * 상세페이지 템플릿의 box-shadow 187번 중 115번이 여러 겹이었다.
 */
describe("parseCssShadow — 여러 겹", () => {
  it("한 겹은 그대로 읽는다", () => {
    expect(parseCssShadow("rgba(18, 63, 181, 0.18) 0px 6px 16px")).toEqual({
      color: "rgba(18, 63, 181, 0.18)",
      offsetX: 0,
      offsetY: 6,
      blur: 16,
    });
  });

  it("두 겹이어도 첫 겹의 «흐림을 잃지 않는다»", () => {
    const parsed = parseCssShadow(
      "rgba(18, 63, 181, 0.18) 0px 10px 26px, rgba(255, 255, 255, 0.6) 0px 6px 16px inset",
    );
    expect(parsed).toEqual({
      color: "rgba(18, 63, 181, 0.18)",
      offsetX: 0,
      offsetY: 10,
      blur: 26,
    });
  });

  it("겹이 둘 다 겉그림자여도 첫 겹을 쓴다", () => {
    expect(
      parseCssShadow("rgba(0, 0, 0, 0.1) 0px 2px 4px, rgba(0, 0, 0, 0.06) 0px 8px 24px"),
    ).toEqual({ color: "rgba(0, 0, 0, 0.1)", offsetX: 0, offsetY: 2, blur: 4 });
  });

  it("첫 겹이 inset 이면 «건너뛰고» 다음 겉그림자를 쓴다", () => {
    expect(
      parseCssShadow("rgba(255, 255, 255, 0.6) 0px 6px 16px inset, rgba(0, 0, 0, 0.2) 0px 4px 12px"),
    ).toEqual({ color: "rgba(0, 0, 0, 0.2)", offsetX: 0, offsetY: 4, blur: 12 });
  });

  it("겹이 전부 inset 이면 그림자가 없다", () => {
    expect(parseCssShadow("rgba(255, 255, 255, 0.6) 0px 6px 16px inset")).toBeNull();
  });

  it("색 안의 쉼표로는 끊지 않는다", () => {
    expect(parseCssShadow("rgba(18, 63, 181, 0.18) 0px 6px 16px")?.color).toBe(
      "rgba(18, 63, 181, 0.18)",
    );
  });
});
