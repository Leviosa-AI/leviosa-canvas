import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DetailPageProperties } from "../detail-page-properties-panel";
import type { GenerateImageGifFn } from "../ai-generate-panel";

// 패널은 이제 소싱 서버를 `DetailPageHost` 로만 만난다 — 가짜 호스트를 꽂고 렌더한다.
import { renderWithDetailPageHost as render } from "./host-stub";


// 결과 GIF는 원본을 **그 자리 그대로** 대체한다. 대체는 실제 구현을 그대로 돌리고
// (좌표 계산이 핵심이므로) store 쪽 addElement/deleteElements 호출만 관찰한다.

function imageElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "img1",
    type: "image",
    opacity: 1,
    cornerRadius: 0,
    x: 40,
    y: 120,
    width: 300,
    height: 200,
    cropX: 0.1,
    cropY: 0.2,
    cropWidth: 0.8,
    cropHeight: 0.6,
    // data URI면 resolveReferenceSrc가 네트워크를 타지 않고 그대로 통과한다.
    src: "data:image/png;base64,AAAA",
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
  element = imageElement(),
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

describe("ImageGifSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("이미지 선택 시 섹션과 크레딧 비용을 노출한다", () => {
    renderPanel(vi.fn());
    expect(screen.getByText("detailPage.properties.imageGif")).toBeTruthy();
    expect(screen.getByRole("button", { name: /imageGifMake · 12/ })).toBeTruthy();
  });

  it("통짜/물체 이펙트를 그룹으로 나눠 보여준다", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn());
    await user.click(screen.getByRole("button", { name: "detailPage.properties.gifEffectChoose" }));
    expect(
      screen.getByText("detailPage.gifEffects.group.whole"),
    ).toBeTruthy();
    expect(
      screen.getByText("detailPage.gifEffects.group.object"),
    ).toBeTruthy();
    // 홀로그램 색 변주는 각각 고를 수 있어야 한다.
    expect(
      screen.getByRole("button", {
        name: /gifEffects.image.holo_foil_silver.label/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /gifEffects.image.holo_foil_gold.label/,
      }),
    ).toBeTruthy();
  });

  it("이펙트마다 실제로 구운 GIF 미리보기를 보여준다", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn());
    await user.click(screen.getByRole("button", { name: "detailPage.properties.gifEffectChoose" }));
    expect(
      screen.getByAltText("detailPage.gifEffects.image.ken_burns.label"),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("/gif-effect-previews/image-ken_burns.gif"),
    );
  });

  it("선택한 이펙트의 설명을 보여준다", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn());
    expect(
      screen.getByText("detailPage.gifEffects.image.ken_burns.hint"),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "detailPage.properties.gifEffectChoose" }));
    await user.click(
      screen.getByRole("button", { name: /gifEffects.image.holo_foil.label/ }),
    );
    expect(
      screen.getByText("detailPage.gifEffects.image.holo_foil.hint"),
    ).toBeTruthy();
  });

  it("이펙트·소스·페이지 배경색을 콜백에 넘기고 원본 자리에 갈아 끼운다", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn().mockResolvedValue({ urls: ["https://s3/a.gif"] });
    const { store } = renderPanel(onGenerate);

    await user.click(screen.getByRole("button", { name: "detailPage.properties.gifEffectChoose" }));
    await user.click(
      screen.getByRole("button", { name: /gifEffects.image.holo_foil.label/ }),
    );
    await user.click(screen.getByRole("button", { name: /imageGifMake/ }));

    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));
    const arg = onGenerate.mock.calls[0][0];
    expect(arg.effect).toBe("holo_foil");
    expect(arg.sourceImage).toBe("data:image/png;base64,AAAA");
    // 캔버스 밖 배경이 페이지 배경과 맞아야 이음매가 안 보인다.
    expect(arg.background).toBe("#f5f0e8");
    await waitFor(() => expect(store.activePage.addElement).toHaveBeenCalled());
    const added = store.activePage.addElement.mock.calls[0][0];
    // 페이지 가운데 62%가 아니라 원본이 있던 자리·크기 그대로여야 한다.
    expect(added).toMatchObject({
      type: "image",
      src: "https://s3/a.gif",
      x: 40,
      y: 120,
      width: 300,
      height: 200,
    });
    // GIF 프레임은 원본 사진 비율 그대로다 — 자르기를 물려받아야 프레이밍이 안 바뀐다.
    expect(added.cropX).toBe(0.1);
    expect(added.cropHeight).toBe(0.6);
    expect(store.deleteElements).toHaveBeenCalledWith(["img1"]);
  });

  it("진행 단계를 버튼 문구로 바꿔 보여준다", async () => {
    const user = userEvent.setup();
    let report: ((p: { stage: string; progress: number }) => void) | undefined;
    // 진행 중 상태를 관찰해야 하므로 콜백은 끝나지 않는 Promise를 돌려준다.
    const onGenerate = vi.fn().mockImplementation(({ onProgress }) => {
      report = onProgress;
      return new Promise(() => undefined);
    });
    renderPanel(onGenerate);
    await user.click(screen.getByRole("button", { name: /imageGifMake/ }));

    await waitFor(() => expect(report).toBeTruthy());
    report?.({ stage: "detecting", progress: 15 });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /gifStageDetecting/ }),
      ).toBeTruthy(),
    );
    report?.({ stage: "rendering", progress: 62 });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /gifStageRendering 62%/ }),
      ).toBeTruthy(),
    );
  });

  it("진행 중에는 취소 버튼을 보여준다", async () => {
    const user = userEvent.setup();
    const onGenerate = vi
      .fn()
      .mockImplementation(() => new Promise(() => undefined));
    renderPanel(onGenerate);
    await user.click(screen.getByRole("button", { name: /imageGifMake/ }));
    await waitFor(() => expect(screen.getByText("detailPage.properties.imageGifCancel")).toBeTruthy());
  });

  it("물체를 못 찾으면 전체 적용했다고 안내한다", async () => {
    const user = userEvent.setup();
    const onGenerate = vi
      .fn()
      .mockResolvedValue({ urls: ["https://s3/a.gif"], maskFallback: true });
    renderPanel(onGenerate);
    await user.click(screen.getByRole("button", { name: /imageGifMake/ }));
    await waitFor(() =>
      expect(screen.getByText("detailPage.properties.imageGifMaskFallback")).toBeTruthy(),
    );
  });

  it("실패 메시지를 노출한다", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn().mockRejectedValue(new Error("이미 GIF를 만들고 있어요."));
    const { store } = renderPanel(onGenerate);
    await user.click(screen.getByRole("button", { name: /imageGifMake/ }));
    await waitFor(() =>
      expect(screen.getByText("이미 GIF를 만들고 있어요.")).toBeTruthy(),
    );
    // 실패했으면 원본은 그대로 남아 있어야 한다.
    expect(store.deleteElements).not.toHaveBeenCalled();
    expect(store.activePage.addElement).not.toHaveBeenCalled();
  });

  it("이미 GIF인 요소에는 섹션을 숨긴다", () => {
    renderPanel(
      vi.fn(),
      imageElement({ src: "https://s3/x.gif", custom: { detailPageGif: true } }),
    );
    expect(screen.queryByText("detailPage.properties.imageGif")).toBeNull();
  });

  it("콜백이 없으면 섹션을 숨긴다", () => {
    render(<DetailPageProperties store={makeStore([imageElement()])} />);
    expect(screen.queryByText("detailPage.properties.imageGif")).toBeNull();
  });
});
