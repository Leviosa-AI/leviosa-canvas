/**
 * 편집기 컴포넌트가 스토어 변경에 다시 그려지는가 (G7-b).
 *
 * 이 한 겹이 전환의 목숨줄이다 — 여기가 조용히 안 돌면 화면이 처음 한 번 그려지고
 * 멈춘 채로 "편집이 안 먹는" 것처럼 보인다.
 */

import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  CanvasStoreContext,
  observer,
} from "../canvas-observer";
import { createCanvasStore } from "@leviosa-ai/canvas/store";

describe("canvas observer", () => {
  it("props가 그대로면 부모가 다시 그려도 안 그린다(memo 한 겹)", () => {
    // mobx `observer`가 얹어 주던 memo다. 빠지면 패널 전부가 부모를 따라 그려진다.
    const renders = vi.fn();
    const View = observer(function View({ label }: { label: string }) {
      renders();
      return <p>{label}</p>;
    });
    let bump: (() => void) | null = null;

    function Parent() {
      const [, setTick] = useState(0);
      bump = () => setTick((n) => n + 1);
      return <View label="고정" />;
    }

    render(<Parent />);
    expect(renders).toHaveBeenCalledTimes(1);

    act(() => bump!());
    expect(renders).toHaveBeenCalledTimes(1);
  });

  it("우리 스토어가 꽂혀 있으면 문서 변경에 다시 그린다", () => {
    const store = createCanvasStore({
      width: 10,
      height: 10,
      pages: [{ id: "p1", children: [{ id: "a", type: "text", text: "처음" }] }],
    });
    const View = observer(function View() {
      return <p>{String(store.getElementById("a")?.text)}</p>;
    });

    render(
      <CanvasStoreContext.Provider value={store}>
        <View />
      </CanvasStoreContext.Provider>,
    );
    expect(screen.getByText("처음")).toBeTruthy();

    act(() => {
      store.getElementById("a")!.set({ text: "다음" });
    });
    expect(screen.getByText("다음")).toBeTruthy();
  });

  it("선택만 바뀌어도 다시 그린다(패널이 선택을 읽는다)", () => {
    const store = createCanvasStore({
      width: 10,
      height: 10,
      pages: [{ id: "p1", children: [{ id: "a", type: "text" }] }],
    });
    const View = observer(function View() {
      return <p>{store.selectedElementsIds.join(",") || "없음"}</p>;
    });

    render(
      <CanvasStoreContext.Provider value={store}>
        <View />
      </CanvasStoreContext.Provider>,
    );
    expect(screen.getByText("없음")).toBeTruthy();

    act(() => store.selectElements(["a"]));
    expect(screen.getByText("a")).toBeTruthy();
  });

  it("스토어가 없으면 아무 데도 안 붙는다(구독 없이 그냥 그린다)", () => {
    const View = observer(function View() {
      return <p>정적</p>;
    });
    render(<View />);
    expect(screen.getByText("정적")).toBeTruthy();
  });
});
