/**
 * 페이지를 픽셀로 뽑는 길 — 내려받기·미리보기·GIF가 전부 여기로 온다.
 *
 * 진짜 Konva 레이어는 jsdom에 없으므로, 스토어가 **어떤 값을 계산해 넘기는지**를 잰다.
 * 배율 상쇄가 틀리면 축소해 놓고 내려받았을 때만 그림이 작게 나오는데, 그건 실제로
 * 겪기 전에는 안 보이는 종류의 버그다.
 */

import { describe, expect, it, vi } from "vitest";

import { createCanvasStore, type PageSurface } from "@/lib/leviosa-canvas/store";

function store() {
  return createCanvasStore({
    width: 750,
    height: 1000,
    pages: [
      { id: "p1", children: [] },
      { id: "p2", height: 500, children: [] },
    ],
  });
}

function fakeSurface(scale: number) {
  const toDataURL = vi.fn(() => "data:image/png;base64,AAA");
  return { scale, toDataURL } satisfies PageSurface;
}

describe("CanvasStore.toDataURL", () => {
  it("화면 배율을 상쇄해 문서 크기로 뽑는다", async () => {
    const s = store();
    const surface = fakeSurface(0.4);
    s.registerPageSurface("p1", surface);

    await s.toDataURL({ pageId: "p1", pixelRatio: 2, mimeType: "image/png" });

    expect(surface.toDataURL).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      // 그리기 면은 화면 배율로 그려져 있다.
      width: 300,
      height: 400,
      // 2 ÷ 0.4 = 5 → 300 × 5 = 1500 = 750 × 2. 문서 기준 2배가 나온다.
      pixelRatio: 5,
      mimeType: "image/png",
    });
  });

  it("페이지마다 자기 높이를 쓴다", async () => {
    const s = store();
    const surface = fakeSurface(1);
    s.registerPageSurface("p2", surface);
    await s.toDataURL({ pageId: "p2" });
    expect(surface.toDataURL).toHaveBeenCalledWith(
      expect.objectContaining({ width: 750, height: 500, pixelRatio: 1 }),
    );
  });

  it("페이지를 안 고르면 보고 있는 페이지를 뽑는다", async () => {
    const s = store();
    const surface = fakeSurface(1);
    s.selectPage("p2");
    s.registerPageSurface("p2", surface);
    await s.toDataURL();
    expect(surface.toDataURL).toHaveBeenCalled();
  });

  it("화면 밖 페이지는 그려 달라고 부탁하고 기다린다", async () => {
    const s = store();
    expect(s.isPageForced("p2")).toBe(false);

    const pending = s.toDataURL({ pageId: "p2" });
    // 부탁이 걸렸고, 작업 영역은 이 신호를 보고 페이지를 띄운다.
    expect(s.isPageForced("p2")).toBe(true);

    s.registerPageSurface("p2", fakeSurface(1));
    await expect(pending).resolves.toContain("data:image/png");
    // 다 뽑았으면 부탁을 거둔다 — 안 거두면 페이지가 계속 떠 있다.
    expect(s.isPageForced("p2")).toBe(false);
  });

  it("끝내 못 그리면 조용히 빈 문자열을 주지 않고 실패한다", async () => {
    const s = store();
    await expect(s.toDataURL({ pageId: "p1", timeoutMs: 10 })).rejects.toThrow(
      /페이지를 그릴 수 없다/,
    );
  });

  it("없는 페이지를 부르면 실패한다", async () => {
    await expect(store().toDataURL({ pageId: "없음", timeoutMs: 10 })).rejects.toThrow();
  });

  it("그림이 다 붙기를 기다린 뒤에 뽑는다", async () => {
    // 안 기다리면 글자와 도형만 있는 썸네일이 나온다 — 실제로 그랬다.
    const s = store();
    const order: string[] = [];
    let release = () => {};
    const surface: PageSurface = {
      scale: 1,
      ready: () =>
        new Promise<void>((resolve) => {
          order.push("ready");
          release = resolve;
        }),
      toDataURL: vi.fn(() => {
        order.push("draw");
        return "data:image/png;base64,AAA";
      }),
    };
    s.registerPageSurface("p1", surface);

    const pending = s.toDataURL({ pageId: "p1" });
    await Promise.resolve();
    expect(order).toEqual(["ready"]);

    release();
    await pending;
    expect(order).toEqual(["ready", "draw"]);
  });
});
