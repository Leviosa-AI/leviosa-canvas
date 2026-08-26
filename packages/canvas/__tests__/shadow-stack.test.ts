import { describe, expect, it } from "vitest";
import { parseCssShadows } from "../paint/konva-fallback";
import { shadowPropsList } from "../render/attrs";

/**
 * Konva 도형은 그림자가 «하나»뿐이라(캔버스 2D 의 ctx.shadowBlur 가 값 하나),
 * 겹이 여럿이면 그리는 쪽이 도형을 겹 수만큼 겹쳐 그린다.
 * 여기서는 「몇 겹을 어떤 값으로 넘기는가」를 못 박는다.
 */
describe("여러 겹 그림자 — 값 펴기", () => {
  it("겉그림자 두 겹을 «순서대로» 편다", () => {
    expect(
      parseCssShadows("rgba(0, 0, 0, 0.1) 0px 2px 4px, rgba(0, 0, 0, 0.06) 0px 8px 24px"),
    ).toEqual([
      { color: "rgba(0, 0, 0, 0.1)", offsetX: 0, offsetY: 2, blur: 4 },
      { color: "rgba(0, 0, 0, 0.06)", offsetX: 0, offsetY: 8, blur: 24 },
    ]);
  });

  it("inset 은 빠진다 — Konva 에 안쪽 그림자가 없다", () => {
    const layers = parseCssShadows(
      "rgba(18, 63, 181, 0.18) 0px 10px 26px, rgba(255, 255, 255, 0.6) 0px 6px 16px inset",
    );
    expect(layers).toHaveLength(1);
    expect(layers[0].blur).toBe(26);
  });

  it("한 겹이면 덧그릴 장이 없다", () => {
    const list = shadowPropsList({ custom: { shadow: "rgba(0,0,0,.2) 0px 4px 12px" } });
    expect(list).toHaveLength(1);
  });

  it("두 겹이면 Konva 속성도 두 벌 나온다", () => {
    const list = shadowPropsList({
      custom: { shadow: "rgba(0, 0, 0, 0.1) 0px 2px 4px, rgba(0, 0, 0, 0.06) 0px 8px 24px" },
    });
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ shadowBlur: 4, shadowOffsetY: 2 });
    expect(list[1]).toMatchObject({ shadowBlur: 24, shadowOffsetY: 8 });
  });

  it("편집기에서 직접 지정한 그림자는 언제나 한 겹이다", () => {
    const list = shadowPropsList({
      shadowEnabled: true,
      shadowColor: "#000",
      shadowBlur: 8,
      custom: { shadow: "rgba(0,0,0,.1) 0px 2px 4px, rgba(0,0,0,.06) 0px 8px 24px" },
    });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ shadowBlur: 8 });
  });
});
