import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DetailPageProperties } from "../detail-page-properties-panel";
import type { GenerateImageGifFn } from "../ai-generate-panel";

// 패널은 이제 소싱 서버를 `DetailPageHost` 로만 만난다 — 가짜 호스트를 꽂고 렌더한다.
import { renderWithDetailPageHost as render } from "./host-stub";


// 도형은 벡터라 픽셀이 없다 — 실제 굽기는 캔버스 몫이므로 여기서는 결과만 대신한다.
const { mockShapeSourceImage } = vi.hoisted(() => ({
  mockShapeSourceImage: vi.fn(),
}));
vi.mock("../../../lib/detail-page/shape-to-image", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/detail-page/shape-to-image")
  >("../../../lib/detail-page/shape-to-image");
  return { ...actual, shapeSourceImage: mockShapeSourceImage };
});

function figureElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "bar1",
    type: "figure",
    subType: "rect",
    x: 60,
    y: 300,
    width: 400,
    height: 24,
    fill: "#26221e",
    opacity: 1,
    cornerRadius: 0,
    custom: {},
    set: vi.fn(),
    ...overrides,
  };
}

function svgElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "svg1",
    type: "svg",
    x: 10,
    y: 20,
    width: 120,
    height: 120,
    src: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
    opacity: 1,
    custom: {},
    set: vi.fn(),
    ...overrides,
  };
}

function makeStore(selected: Array<Record<string, unknown>>) {
  const activePage = {
    id: "p1",
    children: selected,
    background: "#f5f0e8",
    computedWidth: 1000,
    computedHeight: 1400,
    addElement: vi.fn(),
  };
  return {
    selectedElements: selected,
    pages: [activePage],
    activePage,
    deleteElements: vi.fn(),
    ungroupElements: vi.fn(),
  };
}

function renderPanel(
  onGenerateImageGif: ReturnType<typeof vi.fn>,
  element: Record<string, unknown>,
) {
  const store = makeStore([element]);
  return {
    store,
    ...render(
      <DetailPageProperties
        store={store}
        onGenerateImageGif={onGenerateImageGif as unknown as GenerateImageGifFn}
        imageGifCreditCost={12}
      />,
    ),
  };
}

describe("ShapeGifSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockShapeSourceImage.mockReset();
  });

  it("도형(figure)에도 GIF 섹션을 노출한다", () => {
    renderPanel(vi.fn(), figureElement());
    expect(screen.getByText("detailPage.properties.shapeGif")).toBeTruthy();
  });

  it("svg 도형에도 노출한다", () => {
    renderPanel(vi.fn(), svgElement());
    expect(screen.getByText("detailPage.properties.shapeGif")).toBeTruthy();
  });

  it("콜백이 없으면 숨긴다", () => {
    render(<DetailPageProperties store={makeStore([figureElement()])} />);
    expect(screen.queryByText("detailPage.properties.shapeGif")).toBeNull();
  });

  it("배경제거가 붙는 홀로그램 계열은 도형 목록에서 뺀다", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn(), figureElement());
    await user.click(
      screen.getByRole("button", {
        name: "detailPage.properties.gifEffectChoose",
      }),
    );
    expect(
      screen.getByRole("button", { name: /gifEffects.image.wipe_reveal.label/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /gifEffects.image.holo_foil/ }),
    ).toBeNull();
  });

  it("구운 투명 PNG를 소스로 넘기고 도형으로 태그한다", async () => {
    const user = userEvent.setup();
    mockShapeSourceImage.mockResolvedValue("data:image/png;base64,SHAPE");
    const onGenerate = vi.fn().mockResolvedValue({ urls: ["https://s3/a.gif"] });
    const { store } = renderPanel(onGenerate, figureElement());

    await user.click(screen.getByRole("button", { name: /imageGifMake/ }));

    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));
    const arg = onGenerate.mock.calls[0][0];
    expect(arg.sourceImage).toBe("data:image/png;base64,SHAPE");
    expect(arg.assetKind).toBe("shape");
    // 기본 이펙트는 좌→우로 차오르는 와이프(수치가 늘어나는 연출).
    expect(arg.effect).toBe("wipe_reveal");
    // 페이지 배경색을 주면 그 색이 배경으로 눌러 붙는다 — 도형은 투명해야 한다.
    expect(arg.background).toBe("#00000000");
    // 막대가 있던 자리·크기 그대로 갈아 끼운다(가운데 62%로 새로 얹지 않는다).
    await waitFor(() => expect(store.activePage.addElement).toHaveBeenCalled());
    expect(store.activePage.addElement.mock.calls[0][0]).toMatchObject({
      src: "https://s3/a.gif",
      x: 60,
      y: 300,
      width: 400,
      height: 24,
    });
    expect(store.deleteElements).toHaveBeenCalledWith(["bar1"]);
  });

  it("도형을 굽지 못하면 안내하고 크레딧을 쓰지 않는다", async () => {
    const user = userEvent.setup();
    mockShapeSourceImage.mockResolvedValue(null);
    const onGenerate = vi.fn();
    renderPanel(onGenerate, svgElement());

    await user.click(screen.getByRole("button", { name: /imageGifMake/ }));

    await waitFor(() =>
      expect(
        screen.getByText("detailPage.properties.gifShapeUnreadable"),
      ).toBeTruthy(),
    );
    expect(onGenerate).not.toHaveBeenCalled();
  });
});
