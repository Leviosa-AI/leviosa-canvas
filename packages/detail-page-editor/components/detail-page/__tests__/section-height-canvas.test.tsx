/**
 * 섹션 높이를 우리 엔진(leviosa-canvas) 위에서도 만질 수 있어야 한다.
 *
 * 흉내 낸 페이지가 아니라 **진짜 ``CanvasStore``** 위에서 잰다. 높이는 `CanvasPage`의
 * 게터(`computedHeight` → `height`)로 읽히는데, 그 게터를 `set()`이 실제로 가리는지는
 * 스토어를 세워야만 드러난다 — 흉내로 재면 두 엔진이 갈린 것도 통과한다.
 */

import { describe, expect, it } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createRef } from "react";

import { DetailPageProperties } from "../detail-page-properties-panel";
import { CanvasSectionHeightHandle } from "../section-height-handle";
import { createCanvasStore, type CanvasStore } from "@leviosa-ai/canvas/store";
import type { DocumentJson } from "@leviosa-ai/canvas/types";

// 패널은 이제 소싱 서버를 `DetailPageHost` 로만 만난다 — 가짜 호스트를 꽂고 렌더한다.
import { renderWithDetailPageHost as render } from "./host-stub";


function doc(): DocumentJson {
  return {
    width: 750,
    height: 1200,
    unit: "px",
    dpi: 72,
    pages: [
      {
        id: "hero",
        background: "#ffffff",
        children: [
          // 페이지를 꽉 채우는 배경. 페이지만 늘리면 아래에 흰 띠가 남는다.
          {
            id: "bg",
            type: "figure",
            subType: "rect",
            x: 0,
            y: 0,
            width: 750,
            height: 1200,
            fill: "#eee",
          },
          {
            id: "title",
            type: "text",
            x: 40,
            y: 100,
            width: 600,
            height: 80,
            text: "안녕하세요",
            fontSize: 40,
          },
        ],
      },
    ],
  };
}

function store(): CanvasStore {
  const s = createCanvasStore();
  s.loadJSON(doc());
  return s;
}

/**
 * 손잡이가 자리를 잡으려면 활성 화면의 상자를 잴 수 있어야 한다.
 *
 * 처음 붙을 때는 프레임을 한 번 넘겨야 한다 — 자식의 레이아웃 이펙트가 부모의 ref
 * 보다 먼저 돌아서, 그 순간에는 잴 상자가 아직 없다.
 */
async function mountWithPageBox(s: CanvasStore) {
  const containerRef = createRef<HTMLDivElement>();
  const scrollRef = createRef<HTMLDivElement>();
  const result = render(
    <div ref={containerRef}>
      <div ref={scrollRef}>
        <div data-lc-page="hero" />
      </div>
      <CanvasSectionHeightHandle
        store={s}
        containerRef={containerRef}
        scrollRef={scrollRef}
      />
    </div>,
  );
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
  return result;
}

describe("우리 엔진 — 섹션 높이", () => {
  it("페이지 높이는 set()으로 실제로 바뀐다", () => {
    // `computedHeight`는 게터라, `set()`이 자기 속성으로 얹어 가리지 못하면
    // 값이 조용히 문서 기본값에 머문다.
    const s = store();
    const page = s.pages[0];
    page.set({ height: 1600 });
    expect(page.computedHeight).toBe(1600);
  });

  it("우측 패널의 숫자가 캔버스 페이지에도 먹는다", () => {
    const s = store();
    render(<DetailPageProperties store={s} />);
    const input = screen.getByDisplayValue("1200");
    fireEvent.change(input, { target: { value: "1600" } });
    fireEvent.blur(input);
    expect(s.pages[0].computedHeight).toBe(1600);
  });

  it("배경도 같이 늘린다 — 안 그러면 아래에 흰 띠가 생긴다", () => {
    const s = store();
    render(<DetailPageProperties store={s} />);
    const input = screen.getByDisplayValue("1200");
    fireEvent.change(input, { target: { value: "1600" } });
    fireEvent.blur(input);
    expect(s.getElementById("bg")?.height).toBe(1600);
  });

  it("'내용에 맞추기'는 배경을 빼고 잰다", () => {
    // 배경을 세면 "지금 높이"가 그대로 답이 되어 버튼이 아무 일도 안 한다.
    const s = store();
    render(<DetailPageProperties store={s} />);
    fireEvent.click(screen.getByText("detailPage.properties.pageHeightFit"));
    expect(s.pages[0].computedHeight).toBe(200); // 180 → 굽기 하한
  });
});

describe("우리 엔진 — 캔버스 아래 손잡이", () => {
  it("활성 화면에 붙는다", async () => {
    const s = store();
    const { container } = await mountWithPageBox(s);
    expect(container.querySelector("[data-dp-section-height-handle]")).toBeTruthy();
  });

  it("끈 만큼 높이가 바뀐다", async () => {
    const s = store();
    const { container } = await mountWithPageBox(s);
    const handle = container.querySelector(
      "[data-dp-section-height-handle]",
    ) as HTMLElement;
    handle.setPointerCapture = () => {};
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 700 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(s.pages[0].computedHeight).toBe(1400);
    // 손잡이도 우측 패널과 같은 함수를 거친다 — 배경이 따라 늘어난다.
    expect(s.getElementById("bg")?.height).toBe(1400);
  });

  it("축소해서 보고 있으면 그만큼 더 움직인다", async () => {
    const s = store();
    s.setScale(0.5);
    const { container } = await mountWithPageBox(s);
    const handle = container.querySelector(
      "[data-dp-section-height-handle]",
    ) as HTMLElement;
    handle.setPointerCapture = () => {};
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 100 });
    expect(s.pages[0].computedHeight).toBe(1400);
  });

  it("한 번 끈 것은 되돌리기 한 단계다", async () => {
    // 안 묶으면 마우스를 한 번 끄는 사이 수십 단계가 쌓인다.
    const s = store();
    const { container } = await mountWithPageBox(s);
    const handle = container.querySelector(
      "[data-dp-section-height-handle]",
    ) as HTMLElement;
    handle.setPointerCapture = () => {};
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 0 });
    for (let y = 10; y <= 200; y += 10) {
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: y });
    }
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(s.pages[0].computedHeight).toBe(1400);

    s.history.undo();
    expect(s.pages[0].computedHeight).toBe(1200);
  });
});
