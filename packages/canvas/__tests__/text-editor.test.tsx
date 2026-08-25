import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TextEditorOverlay } from "../render/text-editor";
import { createCanvasStore, type CanvasElement } from "../store";
import type { ElementJson } from "../types";

function mount(element: ElementJson, scale = 1) {
  const store = createCanvasStore({
    width: 750,
    height: 1000,
    pages: [{ id: "p", children: [element] }],
  });
  const el = store.getElementById(String(element.id)) as CanvasElement;
  const onDone = vi.fn();
  const view = render(
    <TextEditorOverlay store={store} el={el} scale={scale} onDone={onDone} />,
  );
  const textarea = view.container.querySelector("textarea")!;
  return { store, el, view, textarea, onDone };
}

const BASE: ElementJson = {
  id: "t",
  type: "text",
  x: 40,
  y: 60,
  width: 300,
  height: 48,
  text: "안녕하세요",
  fontSize: 24,
  fontFamily: "Pretendard",
  fontWeight: "700",
  lineHeight: "33.6px",
  letterSpacing: 0.02,
  align: "center",
  fill: "rgb(17, 17, 17)",
};

describe("TextEditorOverlay — 자리 맞추기", () => {
  it("요소의 절대 좌표에 놓이고 배율은 transform으로만 준다", () => {
    const { view } = mount(BASE, 0.5);
    const frame = view.container.querySelector("[data-lc-text-editor]") as HTMLElement;
    expect(frame.style.left).toBe("20px"); // 40 × 0.5
    expect(frame.style.top).toBe("30px"); // 60 × 0.5
    // 상자는 문서 단위 그대로 — 글자 크기·자간을 배율로 곱하면 캐럿이 밀린다.
    expect(frame.style.width).toBe("300px");
    expect(frame.style.transform).toContain("scale(0.5)");
  });

  it("그룹 안 글자도 페이지 기준 자리에 놓인다", () => {
    const store = createCanvasStore({
      width: 750,
      height: 1000,
      pages: [
        {
          id: "p",
          children: [
            {
              id: "g",
              type: "group",
              x: 100,
              y: 200,
              width: 300,
              height: 100,
              children: [{ ...BASE, x: 10, y: 20 }],
            },
          ],
        },
      ],
    });
    const el = store.getElementById("t")!;
    const view = render(
      <TextEditorOverlay store={store} el={el} scale={1} onDone={vi.fn()} />,
    );
    const frame = view.container.querySelector("[data-lc-text-editor]") as HTMLElement;
    expect(frame.style.left).toBe("110px");
    expect(frame.style.top).toBe("220px");
  });

  it("캔버스와 같은 글자 속성을 textarea에 준다", () => {
    const { textarea } = mount(BASE);
    expect(textarea.value).toBe("안녕하세요");
    expect(textarea.style.fontSize).toBe("24px");
    expect(textarea.style.fontFamily).toBe('"Pretendard"');
    expect(textarea.style.textAlign).toBe("center");
    // "33.6px" ÷ 24 = 1.4 배수로 되돌려 넘긴다(Konva도 배수를 쓴다).
    expect(Number(textarea.style.lineHeight)).toBeCloseTo(1.4, 5);
    // letterSpacing은 em으로 저장된다 → px으로.
    expect(textarea.style.letterSpacing).toBe("0.48px");
    // 한 줄 상자는 캔버스와 똑같이 접지 않는다.
    expect(textarea.style.whiteSpace).toBe("pre");
  });

  it("세로 가운데 정렬이면 글자 덩어리만큼 내려 앉힌다", () => {
    const { textarea } = mount({
      ...BASE,
      height: 200,
      verticalAlign: "middle",
      lineHeight: 1.4,
    });
    // 상자 200, 한 줄 33.6 → (200 - 33.6) / 2 ≈ 83.2
    expect(parseFloat(textarea.style.top)).toBeCloseTo(83.2, 1);
  });
});

describe("TextEditorOverlay — 조합 입력", () => {
  it("친 글자가 바로 문서에 들어간다", () => {
    const { textarea, el } = mount(BASE);
    fireEvent.input(textarea, { target: { value: "반갑습니다" } });
    expect(el.text).toBe("반갑습니다");
  });

  it("문서 값을 textarea로 되돌려 넣지 않는다 (조합이 끊기는 자리)", () => {
    const { textarea, el } = mount(BASE);
    fireEvent.input(textarea, { target: { value: "한" } });
    // 문서가 바깥에서 바뀌어도 편집 중인 textarea는 자기 값을 지킨다.
    act(() => el.set({ text: "다른값" }));
    expect(textarea.value).toBe("한");
  });

  it("조합이 끝나면 확정된 글자를 다시 한 번 쓴다", () => {
    const { textarea, el } = mount(BASE);
    fireEvent.compositionStart(textarea);
    fireEvent.input(textarea, { target: { value: "ㅎ" } });
    expect(el.text).toBe("ㅎ");
    fireEvent.compositionEnd(textarea, { target: { value: "하" } });
    expect(el.text).toBe("하");
  });

  it("조합 중 Esc는 IME의 것이다 — 편집을 닫지 않는다", () => {
    const { textarea, onDone } = mount(BASE);
    fireEvent.compositionStart(textarea);
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.compositionEnd(textarea, { target: { value: "하" } });
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("TextEditorOverlay — 히스토리", () => {
  it("편집 한 판이 ⌘Z 한 번이다", () => {
    const { textarea, view, store, el } = mount(BASE);
    fireEvent.input(textarea, { target: { value: "하" } });
    fireEvent.input(textarea, { target: { value: "하나" } });
    fireEvent.input(textarea, { target: { value: "하나둘" } });
    expect(el.text).toBe("하나둘");

    view.unmount();
    store.history.undo();
    expect(store.getElementById("t")!.text).toBe("안녕하세요");
    expect(store.history.canUndo).toBe(false);
  });

  it("아무것도 안 고치고 나가면 undo 단계를 안 만든다", () => {
    const { view, store } = mount(BASE);
    view.unmount();
    expect(store.history.canUndo).toBe(false);
  });
});

describe("TextEditorOverlay — 상자 맞추기", () => {
  it("본문 상자는 글에 맞춰 자라고 원래 높이까지 줄어든다", () => {
    const { textarea, el } = mount({
      ...BASE,
      width: 200,
      height: 120,
      lineHeight: 1.5,
      verticalAlign: "top",
    });
    const before = el.height;
    fireEvent.input(textarea, {
      target: {
        value: Array.from({ length: 40 }, () => "길어지는 본문").join(" "),
      },
    });
    expect(el.height).toBeGreaterThan(before);
    fireEvent.input(textarea, { target: { value: "짧은 본문" } });
    expect(el.height).toBe(before);
    expect((el.custom as Record<string, unknown>).textFitAnchorHeight).toBe(before);
  });

  it.each<[string, number]>([
    ["left", 0],
    ["center", 0.5],
    ["right", 1],
  ])("한 줄 %s 정렬 상자는 기준점을 붙잡고 자랐다 줄어든다", (align, expectedLeft) => {
    const { textarea, el } = mount({ ...BASE, width: 80, align });
    fireEvent.input(textarea, {
      target: { value: "아주 아주 아주 아주 긴 문장입니다" },
    });
    const before = 80;
    expect(el.width).toBeGreaterThan(before);
    expect(el.x).toBe(40);
    expect(el.y).toBe(60);
    expect((el.custom as Record<string, unknown>).textFitAnchorWidth).toBe(before);
    const grown = Number(el.width) - before;
    expect(parseFloat(textarea.style.left)).toBeCloseTo(
      -grown * expectedLeft,
      3,
    );
    fireEvent.input(textarea, { target: { value: "조금 긴 문장" } });
    const shrunk = Number(el.width);
    expect(shrunk).toBeGreaterThan(before);
    expect(shrunk).toBeLessThan(before + grown);
    expect(parseFloat(textarea.style.left)).toBeCloseTo(
      -(shrunk - before) * expectedLeft,
      3,
    );
    fireEvent.input(textarea, { target: { value: "" } });
    expect(el.width).toBe(before);
    expect(el.height).toBe(48);
    expect(parseFloat(textarea.style.left)).toBe(0);
  });

  it("늘어난 width·height가 문서 JSON과 undo에 남는다", () => {
    const { textarea, el, store, view } = mount({ ...BASE, width: 40, height: 10 });
    fireEvent.input(textarea, { target: { value: "길어진 제목" } });
    const saved = store.toJSON().pages?.[0]?.children?.[0];
    expect(saved?.width).toBe(el.width);
    expect(saved?.height).toBe(el.height);
    expect(Number(saved?.width)).toBeGreaterThan(40);
    expect(Number(saved?.height)).toBeGreaterThan(10);
    view.unmount();
    store.history.undo();
    expect(store.getElementById("t")!.width).toBe(40);
    expect(store.getElementById("t")!.height).toBe(10);
  });
});
