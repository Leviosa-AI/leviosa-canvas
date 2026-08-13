import { describe, expect, it, vi } from "vitest";

import { applyBubble, syncBubbleToBox } from "../bubble-tail-overlay";
import { readBubbleParams, type BubbleParams } from "@leviosa-ai/canvas/paint/bubble-path";

const PARAMS: BubbleParams = {
  w: 200,
  h: 100,
  r: 24,
  pad: 20,
  fill: "#FCF5EC",
  stroke: "#F0955A",
  strokeWidth: 4,
  tip: [212, 99],
  base: [26, 26],
  notch: 9,
};

function makeBubble(over: Partial<Record<string, unknown>> = {}) {
  const el = {
    id: "b1",
    type: "svg",
    width: PARAMS.w + 2 * PARAMS.pad,
    height: PARAMS.h + 2 * PARAMS.pad,
    src: "data:image/svg+xml;base64,OLD",
    custom: { color: "rgb(0,0,0)", bubble: PARAMS },
    set: vi.fn(function (this: Record<string, unknown>, props: Record<string, unknown>) {
      Object.assign(this, props);
    }),
    ...over,
  };
  return el as typeof el & { custom: unknown };
}

describe("applyBubble", () => {
  it("path를 다시 구워 src에 넣고 custom.bubble을 갱신한다", () => {
    const el = makeBubble();
    applyBubble(el as never, { ...PARAMS, tip: [-12, 99] });

    expect(el.src.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(el.src).not.toBe("data:image/svg+xml;base64,OLD");
    expect(readBubbleParams(el.custom)?.tip).toEqual([-12, 99]);
  });

  it("custom의 다른 키를 지우지 않는다", () => {
    const el = makeBubble();
    applyBubble(el as never, { ...PARAMS, tip: [100, 118] });
    expect((el.custom as Record<string, unknown>).color).toBe("rgb(0,0,0)");
  });
});

describe("syncBubbleToBox — 리사이즈하면 몸통 크기를 파라미터에 되먹인다", () => {
  // 되먹이지 않으면 스톡 편집기가 svg를 통째로 스케일해 모서리 라운드와 테두리까지 늘어난다.
  it("박스가 커지면 몸통 w/h가 따라 커지고 꼬리는 비율을 유지한다", () => {
    const el = makeBubble({ width: 440, height: 240 }); // pad 20 → 몸통 400x200 (2배)
    expect(syncBubbleToBox(el as never)).toBe(true);

    const p = readBubbleParams(el.custom)!;
    expect(p.w).toBe(400);
    expect(p.h).toBe(200);
    expect(p.tip).toEqual([424, 198]); // 212*2, 99*2 — 몸통에 대한 상대 위치 유지
    expect(p.r).toBe(24); // 라운드와 테두리는 그대로여야 한다
    expect(p.strokeWidth).toBe(4);
  });

  it("크기가 그대로면 아무것도 하지 않는다 (무한 갱신 방지)", () => {
    const el = makeBubble();
    expect(syncBubbleToBox(el as never)).toBe(false);
    expect(el.set).not.toHaveBeenCalled();
  });

  it("말풍선이 아닌 svg는 건드리지 않는다", () => {
    const el = makeBubble({ custom: { color: "rgb(0,0,0)" } });
    expect(syncBubbleToBox(el as never)).toBe(false);
    expect(el.set).not.toHaveBeenCalled();
  });
});
