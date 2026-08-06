import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("konva/lib/shapes/Ellipse", () => ({}));
vi.mock("konva/lib/shapes/Image", () => ({}));
vi.mock("konva/lib/shapes/Rect", () => ({}));
vi.mock("konva/lib/shapes/Text", () => ({}));

/** Konva 노드를 속성이 보이는 div로 바꿔 둔다 — jsdom에는 캔버스가 없다. */
vi.mock("react-konva/es/ReactKonvaCore", () => {
  const node = (kind: string) => {
    const KonvaNode = (
      props: Record<string, unknown> & { children?: ReactNode },
    ) => {
      const { children, ...rest } = props;
      const attrs: Record<string, string> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (value === undefined || typeof value === "function") continue;
        attrs[`data-${key.toLowerCase()}`] =
          typeof value === "object" ? JSON.stringify(value) : String(value);
      }
      return (
        <div data-konva={kind} {...attrs}>
          {children}
        </div>
      );
    };
    KonvaNode.displayName = `Konva(${kind})`;
    return KonvaNode;
  };
  return {
    Group: node("group"),
    Rect: node("rect"),
    Text: node("text"),
    Image: node("image"),
    Ellipse: node("ellipse"),
  };
});

import { ElementView } from "@/lib/leviosa-canvas/render/element-view";
import { createCanvasStore } from "@/lib/leviosa-canvas/store";
import type { ElementJson } from "@/lib/leviosa-canvas/types";

function mount(element: ElementJson) {
  const store = createCanvasStore({
    width: 750,
    height: 1000,
    pages: [{ id: "p", children: [element] }],
  });
  const el = store.pages[0].children[0];
  const view = render(<ElementView el={el} />);
  return { store, el, view };
}

describe("ElementView — 텍스트", () => {
  it("디컴포저의 px lineHeight를 배수로 정규화해서 넘긴다", () => {
    const { view } = mount({
      id: "t",
      type: "text",
      x: 10,
      y: 20,
      width: 300,
      height: 48,
      text: "T.E.N. Miracle",
      fontSize: 44,
      fontFamily: "Didot",
      lineHeight: "48.4px",
      letterSpacing: 0.01,
      fontWeight: "600",
      custom: { fontStyle: "italic" },
    });
    const text = view.container.querySelector('[data-konva="text"]')!;
    expect(Number(text.getAttribute("data-lineheight"))).toBeCloseTo(1.1, 5);
    // letterSpacing은 em으로 저장된다 — Konva의 px으로 되돌려 넘긴다.
    expect(Number(text.getAttribute("data-letterspacing"))).toBeCloseTo(0.44, 5);
    expect(text.getAttribute("data-fontstyle")).toBe("italic bold");
    // 한 줄짜리 상자는 접지 않는다(두 번째 줄이 상자 밖으로 잘린다).
    expect(text.getAttribute("data-wrap")).toBe("none");
    expect(text.textContent).toBe("");
    expect(text.getAttribute("data-text")).toBe("T.E.N. Miracle");
  });

  it("본문처럼 키가 큰 상자는 줄바꿈한다", () => {
    const { view } = mount({
      id: "t",
      type: "text",
      x: 0,
      y: 0,
      width: 300,
      height: 400,
      text: "긴 본문",
      fontSize: 18,
      lineHeight: 1.7,
    });
    expect(
      view.container.querySelector('[data-konva="text"]')!.getAttribute("data-wrap"),
    ).toBe("word");
  });

  it("배경이 켜져 있으면 글자 뒤에 상자를 하나 더 그린다", () => {
    const { view } = mount({
      id: "t",
      type: "text",
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      text: "배지",
      fontSize: 20,
      backgroundEnabled: true,
      backgroundColor: "#ff0000",
      backgroundPadding: 8,
      backgroundCornerRadius: 6,
    });
    const rect = view.container.querySelector('[data-konva="rect"]')!;
    expect(rect.getAttribute("data-fill")).toBe("#ff0000");
    // 글자는 패딩만큼 안으로 들어간다.
    const text = view.container.querySelector('[data-konva="text"]')!;
    expect(text.getAttribute("data-x")).toBe("8");
    expect(text.getAttribute("data-width")).toBe("84");
  });
});

describe("ElementView — 도형·이미지", () => {
  it("사각형은 그라디언트 fill을 Konva 속성으로 받는다", () => {
    const { view } = mount({
      id: "f",
      type: "figure",
      subType: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      fill: "linear-gradient(90deg, #000 0%, #fff 100%)",
      custom: { shadow: "0px 2px 4px rgba(0,0,0,0.3)" },
    });
    const rect = view.container.querySelector('[data-konva="rect"]')!;
    expect(rect.getAttribute("data-filllineargradientcolorstops")).toBe(
      JSON.stringify([0, "#000", 1, "#fff"]),
    );
    // Polotno가 못 읽던 custom.shadow도 그냥 읽는다.
    expect(rect.getAttribute("data-shadowblur")).toBe("4");
  });

  it("타원은 중심 좌표로 옮겨 그린다", () => {
    const { view } = mount({
      id: "f",
      type: "figure",
      subType: "ellipse",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      fill: "#123456",
    });
    // 위치는 요소 프레임이 지고, 그림은 프레임 로컬 좌표로 그린다.
    const frame = view.container.querySelector('[data-id="f"]')!;
    expect(frame.getAttribute("data-x")).toBe("10");
    expect(frame.getAttribute("data-y")).toBe("20");
    const ellipse = view.container.querySelector('[data-konva="ellipse"]')!;
    expect(ellipse.getAttribute("data-x")).toBe("50");
    expect(ellipse.getAttribute("data-y")).toBe("25");
    expect(ellipse.getAttribute("data-radiusx")).toBe("50");
  });

  it("사진이 아직 없으면 빈 슬롯 자리를 그린다", () => {
    const { view } = mount({
      id: "i",
      type: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      src: "",
    });
    const rect = view.container.querySelector('[data-konva="rect"]')!;
    expect(rect.getAttribute("data-dash")).toBe(JSON.stringify([6, 5]));
    expect(view.container.querySelector('[data-konva="image"]')).toBeNull();
  });
});

describe("ElementView — 그룹과 가시성", () => {
  it("그룹은 접지 않고 Konva 그룹으로 중첩된다", () => {
    const { view } = mount({
      id: "g",
      type: "group",
      x: 100,
      y: 200,
      width: 300,
      height: 100,
      children: [
        {
          id: "child",
          type: "figure",
          x: 5,
          y: 5,
          width: 10,
          height: 10,
          fill: "#000",
        },
      ],
    });
    const group = view.container.querySelector('[data-id="g"]')!;
    expect(group.getAttribute("data-x")).toBe("100");
    // 자식 좌표는 그룹 로컬 그대로 — 문서 모델과 같은 좌표계다.
    const child = group.querySelector('[data-id="child"]')!;
    expect(child.getAttribute("data-x")).toBe("5");
  });

  it("visible:false는 아무것도 안 그린다", () => {
    const { view } = mount({
      id: "t",
      type: "text",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      text: "숨김",
      visible: false,
    });
    expect(view.container.querySelector("[data-konva]")).toBeNull();
  });

  it("모르는 타입은 조용히 건너뛴다", () => {
    const { view } = mount({ id: "x", type: "video", x: 0, y: 0, width: 1, height: 1 });
    expect(view.container.querySelector("[data-konva]")).toBeNull();
  });
});

describe("ElementView — 반응성", () => {
  it("요소를 고치면 다시 그린다", () => {
    const { el, view } = mount({
      id: "t",
      type: "text",
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      text: "전",
      fontSize: 20,
    });
    expect(
      view.container.querySelector('[data-konva="text"]')!.getAttribute("data-text"),
    ).toBe("전");
    act(() => el.set({ text: "후" }));
    expect(
      view.container.querySelector('[data-konva="text"]')!.getAttribute("data-text"),
    ).toBe("후");
  });
});
