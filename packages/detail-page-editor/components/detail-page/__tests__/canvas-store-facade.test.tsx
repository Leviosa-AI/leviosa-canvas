/**
 * 캔버스 위 층에 물리는 얼굴 (G4).
 *
 * 두 가지를 잰다. **얼굴이 진짜 스토어를 고치는가**(그림자 속성을 만들지 않는가)와,
 * **바뀔 때만 새 얼굴이 나오는가**. 뒤쪽이 틀리면 오버레이가 `React.memo`에 막혀
 * 조용히 안 움직인다 — 화면에서는 "표 손잡이가 가끔 안 따라온다"로만 보인다.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLegacyStore } from "../canvas-overlay-host";
import { legacyStoreFacade } from "../canvas-store-facade";
import { createCanvasStore } from "@leviosa-ai/canvas/store";
import type { DocumentJson } from "@leviosa-ai/canvas/types";

function doc(): DocumentJson {
  return {
    width: 800,
    height: 600,
    pages: [
      {
        id: "p1",
        children: [
          { id: "a", type: "text", x: 10, y: 10, width: 100, height: 30, text: "가" },
          { id: "b", type: "figure", x: 40, y: 60, width: 80, height: 80 },
        ],
      },
    ],
  };
}

describe("legacyStoreFacade", () => {
  it("고치면 진짜 스토어가 바뀐다 — 얼굴에 그림자 속성이 안 생긴다", () => {
    const store = createCanvasStore(doc());
    const facade = legacyStoreFacade(store);

    facade.selectElements?.(["a"]);

    expect(store.selectedElementsIds).toEqual(["a"]);
    // 얼굴이 들고 있던 배열은 만들어질 때의 것이라 그대로다. 새 값은 새 얼굴이 나른다.
    expect(Object.hasOwn(facade, "selectedElementsIds")).toBe(true);
    expect(legacyStoreFacade(store).selectedElementsIds).toEqual(["a"]);
  });

  it("없는 요소는 undefined다 — 우리는 null을 주므로 여기서 맞춘다", () => {
    const facade = legacyStoreFacade(createCanvasStore(doc()));
    expect(facade.getElementById("없음")).toBeUndefined();
    expect(facade.getElementById("a")?.id).toBe("a");
  });

  it("줌을 나른다", () => {
    const store = createCanvasStore(doc());
    store.setScale(0.4);
    expect(legacyStoreFacade(store).scale).toBe(0.4);
  });

  it("메서드가 살아 있다 — 스프레드였다면 전부 사라졌을 자리", () => {
    const facade = legacyStoreFacade(createCanvasStore(doc()));
    expect(typeof facade.groupElements).toBe("function");
    expect(typeof facade.deleteElements).toBe("function");
    expect(facade.activePage?.addElement).toBeTypeOf("function");
  });
});

describe("useLegacyStore", () => {
  it("문서가 바뀌면 새 얼굴이 나온다", () => {
    const store = createCanvasStore(doc());
    const { result } = renderHook(() => useLegacyStore(store));
    const first = result.current;

    act(() => store.getElementById("a")!.set({ x: 999 }));

    expect(result.current).not.toBe(first);
  });

  it("선택만 바뀌어도 새 얼굴이 나온다", () => {
    const store = createCanvasStore(doc());
    const { result } = renderHook(() => useLegacyStore(store));
    const first = result.current;

    act(() => store.selectElements(["b"]));

    expect(result.current).not.toBe(first);
    expect(result.current.selectedElementsIds).toEqual(["b"]);
  });

  it("아무 일도 없으면 같은 얼굴이다 — 오버레이가 헛돌지 않는다", () => {
    const store = createCanvasStore(doc());
    const { result, rerender } = renderHook(() => useLegacyStore(store));
    const first = result.current;

    rerender();
    // 같은 값으로 다시 선택하는 것은 변경이 아니다.
    act(() => store.selectElements([]));

    expect(result.current).toBe(first);
  });

  it("줌이 바뀌면 새 얼굴이 나온다 — 레일이 다시 재야 한다", () => {
    const store = createCanvasStore(doc());
    const { result } = renderHook(() => useLegacyStore(store));
    const first = result.current;

    act(() => store.setScale(0.25));

    expect(result.current).not.toBe(first);
    expect(result.current.scale).toBe(0.25);
  });
});
