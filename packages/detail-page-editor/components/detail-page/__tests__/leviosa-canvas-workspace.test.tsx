/**
 * 우리 엔진 위의 작업 영역 (G7-b).
 *
 * 여기서 재는 것은 **껍데기의 계약**이다 — 배율이 어디에 사는가, 빈 곳을 누르면
 * 무슨 일이 나는가, 페이지가 실제로 걸리는가. 그림 자체는 엔진 테스트가 잰다.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

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
import { createCanvasStore } from "@leviosa-ai/canvas/store";

function store() {
  return createCanvasStore({
    width: 800,
    height: 600,
    pages: [
      { id: "p1", children: [{ id: "a", type: "text", text: "가", x: 0, y: 0 }] },
      { id: "p2", children: [] },
    ],
  });
}

describe("LeviosaCanvasWorkspace", () => {
  it("페이지를 세로로 건다", () => {
    const s = store();
    const { container } = render(<LeviosaCanvasWorkspace store={s} />);
    expect(container.querySelectorAll("[data-lc-page]")).toHaveLength(2);
  });

  it("빈 곳을 누르면 선택이 풀린다", () => {
    const s = store();
    s.selectElements(["a"]);
    const { container } = render(<LeviosaCanvasWorkspace store={s} />);

    fireEvent.pointerDown(container.querySelector("[data-lc-workspace] > div")!);
    expect(s.selectedElementsIds).toEqual([]);
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
