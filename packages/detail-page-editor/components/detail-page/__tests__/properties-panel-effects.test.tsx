// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, fireEvent, render as rtlRender, screen } from "@testing-library/react";

import {
  DetailPageProperties,
  rotateAboutCenter,
} from "../detail-page-properties-panel";
import { GESTURE_IDLE_MS } from "../inspector-controls";
import { CanvasStoreContext } from "../canvas-observer";
import { createCanvasStore } from "@leviosa-ai/canvas/store";
import { encodeSvgDataUri } from "../../../lib/detail-page-canvas/export/svg";

import { withDetailPageHost } from "./host-stub";

type Store = ReturnType<typeof createCanvasStore>;

function makeStore(children: Array<Record<string, unknown>>) {
  return createCanvasStore({
    width: 400,
    height: 400,
    pages: [{ id: "p1", background: "#ffffff", children }],
  });
}

function render(store: Store, ui?: ReactNode, host?: Parameters<typeof withDetailPageHost>[1]) {
  return rtlRender(
    withDetailPageHost(
      <CanvasStoreContext.Provider value={store}>
        {ui ?? <DetailPageProperties store={store} />}
      </CanvasStoreContext.Provider>,
      host,
    ),
  );
}

/** undo 로 몇 번 되돌릴 수 있는가. */
function undoDepth(store: Store): number {
  let n = 0;
  const json = JSON.stringify(store.toJSON());
  while (store.history.canUndo) {
    store.history.undo();
    n += 1;
  }
  while (store.history.canRedo) store.history.redo();
  expect(JSON.stringify(store.toJSON())).toBe(json);
  return n;
}

const text = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "text",
  x: 10,
  y: 10,
  width: 100,
  height: 40,
  text: "hi",
  opacity: 1,
  ...extra,
});
const figure = (id: string) => ({
  id,
  type: "figure",
  x: 0,
  y: 0,
  width: 50,
  height: 50,
  fill: "#ff0000",
  opacity: 1,
});

describe("속성 패널 — 슬라이더 undo", () => {
  afterEach(() => vi.useRealTimers());

  it("불투명도 드래그 한 번(pointerdown → 여러 change → pointerup)은 undo 한 단계다", () => {
    const store = makeStore([text("t1")]);
    store.selectElements(["t1"]);
    render(store);

    const slider = screen.getByRole("slider", { name: "detailPage.properties.opacity" });
    fireEvent.pointerDown(slider);
    for (const v of [90, 70, 50, 30]) fireEvent.change(slider, { target: { value: String(v) } });
    fireEvent.pointerUp(slider);

    expect(store.getElementById("t1")!.opacity).toBe(0.3);
    expect(undoDepth(store)).toBe(1);
  });

  it("포인터 없이 들어온 연속 변경은 잠깐 멈추면 한 단계로 닫힌다", () => {
    vi.useFakeTimers();
    const store = makeStore([figure("f1")]);
    store.selectElements(["f1"]);
    render(store);

    const slider = screen.getByRole("slider", { name: "detailPage.properties.cornerRadius" });
    for (const v of [5, 10, 20]) fireEvent.change(slider, { target: { value: String(v) } });
    act(() => vi.advanceTimersByTime(GESTURE_IDLE_MS + 10));
    fireEvent.change(slider, { target: { value: "40" } });
    act(() => vi.advanceTimersByTime(GESTURE_IDLE_MS + 10));

    expect(undoDepth(store)).toBe(2);
  });

  it("다중 선택에 한 번 넣은 값(setAll)은 요소 수와 무관하게 undo 한 단계다", () => {
    const store = makeStore([text("t1"), figure("f1"), figure("f2")]);
    store.selectElements(["t1", "f1", "f2"]);
    render(store);

    fireEvent.click(screen.getByRole("button", { name: "detailPage.properties.shadow" }));

    for (const id of ["t1", "f1", "f2"]) {
      expect(store.getElementById(id)!.shadowEnabled).toBe(true);
    }
    expect(undoDepth(store)).toBe(1);
  });
});

describe("속성 패널 — 효과(그림자·외곽선·회전)", () => {
  it("텍스트에 그림자를 켜고 흐림을 바꾼다", () => {
    const store = makeStore([text("t1")]);
    store.selectElements(["t1"]);
    render(store);

    const toggle = screen.getByRole("button", { name: "detailPage.properties.shadow" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    const blur = screen.getByLabelText("detailPage.properties.shadowBlur");
    fireEvent.change(blur, { target: { value: "20" } });
    fireEvent.blur(blur);
    expect(store.getElementById("t1")!.shadowBlur).toBe(20);
  });

  it("외곽선 굵기를 넣으면 색도 같이 들어가 렌더러가 그린다", () => {
    const store = makeStore([text("t1")]);
    store.selectElements(["t1"]);
    render(store);

    const width = screen.getByLabelText("detailPage.properties.strokeWidth");
    fireEvent.change(width, { target: { value: "3" } });
    fireEvent.blur(width);
    const el = store.getElementById("t1")!;
    expect(el.strokeWidth).toBe(3);
    expect(el.stroke).toBe("#000000");
  });

  it("사진에는 외곽선이 없다(렌더러가 안 그린다)", () => {
    const store = makeStore([
      { id: "i1", type: "image", x: 0, y: 0, width: 10, height: 10, src: "https://s3/a.png" },
    ]);
    store.selectElements(["i1"]);
    render(store);
    expect(screen.getByRole("button", { name: "detailPage.properties.shadow" })).toBeTruthy();
    expect(screen.queryByLabelText("detailPage.properties.strokeWidth")).toBeNull();
  });

  it("회전은 가운데를 제자리에 둔다", () => {
    const store = makeStore([figure("f1")]);
    store.selectElements(["f1"]);
    render(store);

    const rot = screen.getByLabelText("detailPage.properties.rotation");
    fireEvent.change(rot, { target: { value: "90" } });
    fireEvent.blur(rot);
    const el = store.getElementById("f1")!;
    expect(el.rotation).toBe(90);
    // 50×50 상자의 가운데 (25,25) 가 그대로 — 90° 면 왼쪽 위가 (50,0) 으로 간다.
    expect(el.x).toBeCloseTo(50);
    expect(el.y).toBeCloseTo(0);
  });

  it("rotateAboutCenter: 0°로 되돌리면 원래 자리다", () => {
    const box = { x: 10, y: 20, width: 100, height: 40, rotation: 0 };
    const turned = rotateAboutCenter(box, 37);
    const back = rotateAboutCenter({ ...box, ...turned }, 0);
    expect(back.x).toBeCloseTo(10);
    expect(back.y).toBeCloseTo(20);
  });
});

describe("속성 패널 — 페이지 배경·혼합 선택", () => {
  it("선택이 없으면 페이지 배경색을 바꿀 수 있다", () => {
    const store = makeStore([]);
    render(store);

    expect(screen.getByText("detailPage.properties.pageBackground")).toBeTruthy();
    fireEvent.click(screen.getByTitle("#ffffff"));
    const hex = screen.getByPlaceholderText("#000000");
    fireEvent.change(hex, { target: { value: "#112233" } });
    fireEvent.keyDown(hex, { key: "Enter" });
    expect(store.pages[0].background).toBe("#112233");
  });

  it("텍스트+도형 혼합 선택이면 채우기·효과를 같이 보여 주고 한 번에 바꾼다", () => {
    const store = makeStore([text("t1"), figure("f1")]);
    store.selectElements(["t1", "f1"]);
    render(store);

    fireEvent.click(screen.getByRole("button", { name: "detailPage.properties.fillGradient" }));
    expect(String(store.getElementById("t1")!.fill)).toContain("linear-gradient");
    expect(String(store.getElementById("f1")!.fill)).toContain("linear-gradient");
    expect(screen.getByLabelText("detailPage.properties.strokeWidth")).toBeTruthy();
  });

  it("사진+svg 혼합이면 채우기·효과는 숨기고 불투명도·삭제만", () => {
    const store = makeStore([
      { id: "i1", type: "image", x: 0, y: 0, width: 10, height: 10, src: "https://s3/a.png" },
      { id: "s1", type: "svg", x: 0, y: 0, width: 10, height: 10, src: "" },
    ]);
    store.selectElements(["i1", "s1"]);
    render(store);
    expect(screen.queryByRole("button", { name: "detailPage.properties.fillSolid" })).toBeNull();
    expect(screen.queryByRole("button", { name: "detailPage.properties.shadow" })).toBeNull();
    expect(screen.getByRole("slider", { name: "detailPage.properties.opacity" })).toBeTruthy();
  });
});

describe("속성 패널 — 도형 저장 실패", () => {
  it("저장이 던지면 토스트로 알린다", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#f00"/></svg>';
    const store = makeStore([
      { id: "s1", type: "svg", x: 0, y: 0, width: 10, height: 10, src: encodeSvgDataUri(svg) },
    ]);
    store.selectElements(["s1"]);
    const toastError = vi.fn();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(store, undefined, {
      api: { savePersonalDetailPageShape: vi.fn().mockRejectedValue(new Error("boom")) },
      brand: { getStoredActiveBrandId: () => null },
      toast: { error: toastError },
    });

    fireEvent.click(screen.getByRole("button", { name: "detailPage.properties.saveToMyShapes" }));
    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("detailPage.properties.shapeSaveFailed"),
    );
    errSpy.mockRestore();
  });
});
