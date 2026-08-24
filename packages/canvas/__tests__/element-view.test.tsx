import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("konva/lib/shapes/Ellipse", () => ({}));
vi.mock("konva/lib/shapes/Image", () => ({}));
vi.mock("konva/lib/shapes/Path", () => ({}));
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
    Path: node("path"),
  };
});

import { ElementView } from "../render/element-view";
import { encodeSvgSrc } from "../render/svg-source";
import { createCanvasStore } from "../store";
import type { ElementJson } from "../types";

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
      fontStyle: "italic",
      custom: { fontStyle: "italic" },
    });
    const text = view.container.querySelector('[data-konva="text"]')!;
    expect(Number(text.getAttribute("data-lineheight"))).toBeCloseTo(1.1, 5);
    // letterSpacing은 em으로 저장된다 — Konva의 px으로 되돌려 넘긴다.
    expect(Number(text.getAttribute("data-letterspacing"))).toBeCloseTo(0.44, 5);
    expect(text.getAttribute("data-fontstyle")).toBe("italic 600");
    // 한 줄짜리 상자는 접지 않는다(두 번째 줄이 상자 밖으로 잘린다).
    expect(text.getAttribute("data-wrap")).toBe("none");
    expect(text.textContent).toBe("");
    expect(text.getAttribute("data-text")).toBe("T.E.N. Miracle");
  });

  it("상자가 짧아도 줄을 버리지 않는다", () => {
    // Konva는 height를 주면 넘치는 줄을 조용히 삼킨다 — 헤아림 1쪽의 마지막 문장이
    // 그렇게 사라졌다. 높이를 안 주는 것이 그 방지책이라 여기서 못 박는다.
    const { view } = mount({
      id: "t",
      type: "text",
      x: 0,
      y: 0,
      width: 200,
      height: 40,
      text: "저희는 제품의 품질과 효과에 대해 자신 있습니다. 100% 환불해 드립니다.",
      fontSize: 20,
      lineHeight: 1.5,
    });
    const text = view.container.querySelector('[data-konva="text"]')!;
    expect(text.getAttribute("data-height")).toBe(null);
    expect(text.getAttribute("data-y")).toBe("0");
  });

  it("custom에만 있는 italic으로는 기울이지 않는다", () => {
    // 싱크로 하네스가 잡아낸 것 — 오늘 팔리는 그림에는 없는 기울임이었다.
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
      fontWeight: "600",
      custom: { fontStyle: "italic" },
    });
    const text = view.container.querySelector('[data-konva="text"]')!;
    expect(text.getAttribute("data-fontstyle")).toBe("600");
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
    // 스톡 편집기가 못 읽던 custom.shadow도 그냥 읽는다.
    expect(rect.getAttribute("data-shadowblur")).toBe("4");
  });

  it("굵기 0인 획은 색까지 같이 떨어뜨린다", () => {
    // Konva는 strokeWidth를 안 주면 1로 채운다. 분해기 문서는 획을 안 쓰는 figure에도
    // `stroke: rgb(26,26,26) / strokeWidth: 0`을 남기므로, 색만 넘기면 섹션 바탕마다
    // 검은 1px 테두리가 생긴다. 내보내기 넷은 모두 `width > 0`으로 게이트한다.
    const { view } = mount({
      id: "f",
      type: "figure",
      subType: "rect",
      x: 0,
      y: 0,
      width: 750,
      height: 238,
      fill: "#f4f4f5",
      stroke: "rgb(26, 26, 26)",
      strokeWidth: 0,
    });
    const rect = view.container.querySelector('[data-konva="rect"]')!;
    expect(rect.getAttribute("data-stroke")).toBeNull();
    expect(rect.getAttribute("data-strokewidth")).toBeNull();
  });

  it("굵기가 있으면 획을 그대로 그린다", () => {
    const { view } = mount({
      id: "f",
      type: "figure",
      subType: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      fill: "#ffffff",
      stroke: "#169dc0",
      strokeWidth: 2,
    });
    const rect = view.container.querySelector('[data-konva="rect"]')!;
    expect(rect.getAttribute("data-stroke")).toBe("#169dc0");
    expect(rect.getAttribute("data-strokewidth")).toBe("2");
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

describe("ElementView — svg", () => {
  it("말풍선은 이미지가 아니라 네이티브 path로 그린다", () => {
    const { view } = mount({
      id: "b",
      type: "svg",
      x: 40,
      y: 60,
      width: 220,
      height: 120,
      src: "data:image/svg+xml;base64,PHN2Zy8+",
      custom: {
        bubble: {
          w: 200,
          h: 100,
          r: 16,
          pad: 10,
          fill: "#ffffff",
          stroke: "#111111",
          strokeWidth: 2,
          tip: [100, 140],
        },
      },
    });
    const path = view.container.querySelector('[data-konva="path"]')!;
    expect(path).toBeTruthy();
    expect(path.getAttribute("data-data")).toMatch(/^M/);
    expect(path.getAttribute("data-fill")).toBe("#ffffff");
    expect(path.getAttribute("data-stroke")).toBe("#111111");
    // 이미지로 굽지 않는다 — 확대해도 안 뭉개지고 꼬리를 끌 때 안 깜빡인다.
    expect(view.container.querySelector('[data-konva="image"]')).toBeNull();

    // viewBox가 (-pad,-pad)에서 시작하므로 요소 원점으로 pad만큼 옮겨 그린다.
    // 상자 220 ÷ viewBox 220 = 1배 → 10.
    const frame = view.container.querySelector('[data-konva="group"] [data-konva="group"]')!;
    expect(frame.getAttribute("data-x")).toBe("10");
  });

  it("말풍선이 아닌 svg는 마크업을 이미지로 그린다", () => {
    const markup = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#3b3733"/></svg>';
    const { view } = mount({
      id: "s",
      type: "svg",
      x: 0,
      y: 0,
      width: 66,
      height: 66,
      src: encodeSvgSrc(markup),
      colorsReplace: { "rgb(59, 55, 51)": "#c2410c" },
    });
    // path 경로로 새지 않는다(말풍선이 아니다). 색 치환 자체는 svg-source가 잰다 —
    // jsdom에는 이미지 디코더가 없어 화면에서는 자리표시 사각형까지만 보인다.
    expect(view.container.querySelector('[data-konva="path"]')).toBeNull();
    expect(view.container.querySelector('[data-konva="rect"]')).toBeTruthy();
  });
});
