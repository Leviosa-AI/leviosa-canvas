/**
 * 우리 엔진 위의 작업 영역 (G7-b).
 *
 * 여기서 재는 것은 **껍데기의 계약**이다 — 배율이 어디에 사는가, 빈 곳을 누르면
 * 무슨 일이 나는가, 페이지가 실제로 걸리는가. 그림 자체는 엔진 테스트가 잰다.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("konva/lib/shapes/Ellipse", () => ({}));
vi.mock("konva/lib/shapes/Image", () => ({}));
vi.mock("konva/lib/shapes/Line", () => ({}));
vi.mock("konva/lib/shapes/Path", () => ({}));
vi.mock("konva/lib/shapes/Rect", () => ({}));
vi.mock("konva/lib/shapes/Text", () => ({}));
vi.mock("konva/lib/shapes/Transformer", () => ({}));

/** jsdom에는 캔버스가 없다 — Konva 노드를 속성이 보이는 div로 바꾼다. */
vi.mock("react-konva/es/ReactKonvaCore", () => {
  const node = (kind: string) => {
    const KonvaNode = (
      props: Record<string, unknown> & { children?: ReactNode },
    ) => <div data-konva={kind}>{props.children}</div>;
    KonvaNode.displayName = `Konva(${kind})`;
    return KonvaNode;
  };
  return {
    Stage: node("stage"),
    Layer: node("layer"),
    Group: node("group"),
    Rect: node("rect"),
    Line: node("line"),
    Text: node("text"),
    Image: node("image"),
    Ellipse: node("ellipse"),
    Path: node("path"),
    Transformer: node("transformer"),
  };
});

import { LeviosaCanvasWorkspace } from "../leviosa-canvas-workspace";
import { PAGES_TIMELINE_HEIGHT } from "../detail-page-pages-timeline";
import { createCanvasStore } from "@leviosa-ai/canvas/store";
import { selectDetailPageEditorProfile } from "../../../lib/detail-page/editor-profile";

function store() {
  return createCanvasStore({
    width: 800,
    height: 600,
    pages: [
      {
        id: "p1",
        children: [{ id: "a", type: "text", text: "가", x: 0, y: 0 }],
      },
      { id: "p2", children: [] },
    ],
  });
}

/**
 * 장 높이 손잡이는 상세페이지 것이다 — 한 장이 세로로 이어 붙는 띠라서 길이가
 * 편집 대상이다. 캐러셀 판은 1080×1350 고정이라 끌 수 있으면 안 된다.
 */
describe("LeviosaCanvasWorkspace — 장 높이 손잡이", () => {
  afterEach(() => selectDetailPageEditorProfile({}));

  const mount = async () => {
    const view = render(<LeviosaCanvasWorkspace store={store()} />);
    await act(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null)),
      );
    });
    return view;
  };

  it("상세페이지에서는 활성 장 아래에 붙는다", async () => {
    const view = await mount();
    expect(
      view.container.querySelectorAll("[data-dp-section-height-handle]"),
    ).toHaveLength(1);
  });

  it("끌면 그 장이 길어지고 칸도 같이 커진다 — 아래 장이 밀린다", async () => {
    const s = store();
    const view = render(<LeviosaCanvasWorkspace store={s} />);
    await act(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null)),
      );
    });
    const handle = view.container.querySelector<HTMLElement>(
      "[data-dp-section-height-handle]",
    )!;
    const box = () =>
      view.container.querySelector<HTMLElement>('[data-lc-page="p1"]')!;
    const before = s.pages[0].computedHeight;

    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(handle, { clientX: 0, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 0, clientY: 300, pointerId: 1 });

    expect(s.pages[0].computedHeight).toBe(before + 300);
    // 칸이 안 커지면 늘어난 만큼이 아래 장에 덮인다.
    expect(box().style.height).toBe(`${before + 300}px`);
  });

  it("아래 띠·하단 독보다 위에 있다 — 덮이면 잡을 수가 없다", async () => {
    const view = await mount();
    const frame = view.container.querySelector<HTMLElement>(
      "[data-dp-section-height-frame]",
    )!;
    const dock = view.container.querySelector<HTMLElement>(
      "[data-dp-bottom-dock]",
    )!;
    expect(Number(frame.style.zIndex)).toBeGreaterThan(
      Number(dock.style.zIndex),
    );
  });

  it("캐러셀에서는 없다 — 판 크기가 고정이다", async () => {
    selectDetailPageEditorProfile({ kind: "carousel" });
    const view = await mount();
    expect(
      view.container.querySelectorAll("[data-dp-section-height-handle]"),
    ).toHaveLength(0);
  });
});

describe("LeviosaCanvasWorkspace", () => {
  it("편집을 멈추면 바뀐 페이지만 썸네일을 다시 굽는다", async () => {
    vi.useFakeTimers();
    try {
      const s = store();
      const renderPage = vi
        .spyOn(s, "toDataURL")
        .mockImplementation(async ({ pageId } = {}) => `data:${pageId}`);
      render(<LeviosaCanvasWorkspace store={s} />);

      act(() => s.openSidePanel("pages"));
      await act(async () => vi.advanceTimersByTimeAsync(250));
      expect(renderPage).toHaveBeenCalledTimes(2);

      act(() => {
        s.getElementById("a")?.set({ text: "나" });
        s.getElementById("a")?.set({ text: "다" });
      });
      await act(async () => vi.advanceTimersByTimeAsync(249));
      expect(renderPage).toHaveBeenCalledTimes(2);
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(renderPage).toHaveBeenCalledTimes(3);
      expect(renderPage).toHaveBeenLastCalledWith({
        pageId: "p1",
        pixelRatio: 0.12,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("페이지를 세로로 건다", () => {
    const s = store();
    const { container } = render(<LeviosaCanvasWorkspace store={s} />);
    expect(container.querySelectorAll("[data-lc-page]")).toHaveLength(2);
  });

  it("빈 곳을 누르면 선택이 풀린다", () => {
    const s = store();
    s.selectElements(["a"]);
    const { container } = render(<LeviosaCanvasWorkspace store={s} />);

    fireEvent.pointerDown(
      container.querySelector("[data-lc-workspace] > div")!,
    );
    expect(s.selectedElementsIds).toEqual([]);
  });

  it("페이지 밖 여백을 끌면 화면이 가로세로로 옮겨진다", () => {
    const { container } = render(
      <LeviosaCanvasWorkspace store={store()} />,
    );
    const workspace = container.querySelector<HTMLElement>(
      "[data-lc-workspace] > div",
    )!;
    workspace.scrollLeft = 40;
    workspace.scrollTop = 60;

    fireEvent.pointerDown(workspace, {
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(workspace, {
      pointerId: 1,
      clientX: 70,
      clientY: 50,
    });

    expect(workspace.scrollLeft).toBe(70);
    expect(workspace.scrollTop).toBe(110);
    expect(workspace.style.overflowX).toBe("auto");
    expect(workspace.style.cursor).toBe("grabbing");

    fireEvent.pointerUp(workspace, { pointerId: 1 });
    expect(workspace.style.cursor).toBe("default");

    const page = container.querySelector<HTMLElement>("[data-lc-page]")!;
    fireEvent.pointerDown(page, {
      button: 0,
      pointerId: 2,
      clientX: 70,
      clientY: 50,
    });
    fireEvent.pointerMove(page, {
      pointerId: 2,
      clientX: 20,
      clientY: 10,
    });
    expect(workspace.scrollLeft).toBe(70);
    expect(workspace.scrollTop).toBe(110);
  });

  it("⌘+휠은 스토어의 배율을 바꾼다(버튼과 같은 자리여야 한다)", () => {
    const s = store();
    const { container } = render(<LeviosaCanvasWorkspace store={s} />);
    const inner = container.querySelector("[data-lc-workspace] > div")!;
    const before = s.scale;

    act(() => {
      fireEvent.wheel(inner, { deltaY: -100, metaKey: true });
    });

    expect(s.scale).toBeGreaterThan(before);
  });

  it("그냥 휠은 배율을 안 건드린다(브라우저 스크롤 그대로)", () => {
    const s = store();
    const { container } = render(<LeviosaCanvasWorkspace store={s} />);
    const inner = container.querySelector("[data-lc-workspace] > div")!;
    const before = s.scale;

    act(() => {
      fireEvent.wheel(inner, { deltaY: -100 });
    });

    expect(s.scale).toBe(before);
  });

  it("삽입과 배율은 같은 줄에 산다", () => {
    const s = store();
    const { container } = render(<LeviosaCanvasWorkspace store={s} />);
    const dock = container.querySelector("[data-dp-bottom-dock]")!;

    expect(dock.querySelector("[data-dp-insert-dock]")).toBeTruthy();
    expect(dock.querySelector("[data-dp-zoom-dock]")).toBeTruthy();
  });

  it("화면이 여럿이면 아래 띠가 화면 목록 위로 비킨다", () => {
    const s = store(); // 페이지 둘 — 목록이 뜬다
    const { container } = render(<LeviosaCanvasWorkspace store={s} />);
    const dock = container.querySelector<HTMLElement>("[data-dp-bottom-dock]")!;

    expect(dock.style.bottom).toBe(`${PAGES_TIMELINE_HEIGHT + 16}px`);
  });

  it("화면이 하나면 목록이 없으니 가장자리에 붙는다", () => {
    const s = createCanvasStore({
      width: 800,
      height: 600,
      pages: [{ id: "p1", children: [] }],
    });
    const { container } = render(<LeviosaCanvasWorkspace store={s} />);
    const dock = container.querySelector<HTMLElement>("[data-dp-bottom-dock]")!;

    expect(dock.style.bottom).toBe("16px");
  });

  it("얹은 것을 그대로 그린다", () => {
    const s = store();
    render(
      <LeviosaCanvasWorkspace store={s}>
        <p>덧댄 층</p>
      </LeviosaCanvasWorkspace>,
    );
    expect(screen.getByText("덧댄 층")).toBeTruthy();
  });
});
