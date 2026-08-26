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

/**
 * 안쪽 그림자는 캔버스에 «없는» 것이라 만들어 그린다 —
 * 도형으로 클립을 걸고 「큰 사각형 − 도형」 고리를 채워서, 그 고리의 그림자가
 * 안쪽으로 번져 들어오게 한다. 여기서는 값 읽기와 그리는 절차를 못 박는다.
 */
describe("안쪽 그림자(inset)", () => {
  it("inset 겹만 골라 읽는다", async () => {
    const { parseCssInsetShadows } = await import("../paint/konva-fallback");
    expect(
      parseCssInsetShadows(
        "rgba(18, 63, 181, 0.18) 0px 10px 26px, rgba(255, 255, 255, 0.6) 0px 6px 16px inset",
      ),
    ).toEqual([{ color: "rgba(255, 255, 255, 0.6)", offsetX: 0, offsetY: 6, blur: 16 }]);
  });

  it("겉그림자만 있으면 안쪽 그림자는 없다", async () => {
    const { parseCssInsetShadows } = await import("../paint/konva-fallback");
    expect(parseCssInsetShadows("rgba(0,0,0,.2) 0px 4px 12px")).toEqual([]);
  });

  it("클립을 걸고 «even-odd 고리»를 불투명하게 채운다", async () => {
    const { drawInsetShadowRect } = await import("../paint/inset-shadow");
    const calls: string[] = [];
    const ctx = {
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      beginPath: () => calls.push("beginPath"),
      closePath: () => {},
      clip: () => calls.push("clip"),
      moveTo: () => {},
      arcTo: () => {},
      rect: () => calls.push("rect"),
      ellipse: () => {},
      fill: (rule?: string) => calls.push(`fill:${rule}`),
      shadowColor: "",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;

    drawInsetShadowRect(ctx, 100, 60, 12, {
      color: "rgba(255,255,255,.6)",
      offsetX: 0,
      offsetY: 6,
      blur: 16,
    });

    expect(calls).toEqual([
      "save", "beginPath", "clip", "beginPath", "rect", "fill:evenodd", "restore",
    ]);
    expect(ctx.shadowColor).toBe("rgba(255,255,255,.6)");
    expect(ctx.shadowBlur).toBe(16);
    // 반투명하게 채우면 그림자까지 옅어진다 — 색과 진하기는 shadowColor 가 든다.
    expect(ctx.fillStyle).toBe("#000000");
  });

  it("크기가 0 이면 아무것도 안 그린다", async () => {
    const { drawInsetShadowRect } = await import("../paint/inset-shadow");
    let touched = false;
    const ctx = { save: () => { touched = true; } } as unknown as CanvasRenderingContext2D;
    drawInsetShadowRect(ctx, 0, 60, 0, { color: "#000", offsetX: 0, offsetY: 0, blur: 4 });
    expect(touched).toBe(false);
  });
});
