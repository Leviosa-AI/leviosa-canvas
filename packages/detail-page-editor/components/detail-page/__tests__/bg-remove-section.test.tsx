import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DetailPageProperties } from "../detail-page-properties-panel";
import type { RemoveBackgroundFn } from "../ai-generate-panel";

// 패널은 이제 소싱 서버를 `DetailPageHost` 로만 만난다 — 가짜 호스트를 꽂고 렌더한다.
import { renderWithDetailPageHost as render } from "./host-stub";


// 누끼는 GIF와 달리 **새 요소를 삽입하지 않는다** — 선택 요소의 src만 갈아 끼운다.
// 그래야 자리·크기·자르기가 그대로 남는다. 테스트는 그 계약을 지킨다.

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
  onRemoveBackground?: ReturnType<typeof vi.fn>,
  element = imageElement(),
) {
  const store = makeStore([element]);
  return {
    store,
    element,
    ...render(
      <DetailPageProperties
        store={store}
        onRemoveBackground={
          onRemoveBackground as unknown as RemoveBackgroundFn | undefined
        }
        bgRemoveCreditCost={1}
      />,
    ),
  };
}

describe("BgRemoveSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("이미지 선택 시 섹션과 크레딧 비용을 노출한다", () => {
    renderPanel(vi.fn());
    expect(screen.getByText("detailPage.properties.bgRemove")).toBeTruthy();
    expect(screen.getByRole("button", { name: /bgRemoveRun · 1/ })).toBeTruthy();
  });

  it("콜백이 없으면 섹션을 숨긴다", () => {
    renderPanel(undefined);
    expect(screen.queryByText("detailPage.properties.bgRemove")).toBeNull();
  });

  it("GIF 요소에는 섹션을 숨긴다", () => {
    // 프레임마다 지워야 해서 같은 경로로 처리되지 않는다.
    renderPanel(vi.fn(), imageElement({ custom: { detailPageGif: true } }));
    expect(screen.queryByText("detailPage.properties.bgRemove")).toBeNull();
  });

  it("컷아웃을 그 자리에서 src로 갈아 끼우고 새 요소를 만들지 않는다", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue("https://s3/cutout.png");
    const { store, element } = renderPanel(onRemove);

    await user.click(screen.getByRole("button", { name: /bgRemoveRun/ }));

    await waitFor(() =>
      expect(element.set).toHaveBeenCalledWith({ src: "https://s3/cutout.png" }),
    );
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ sourceImage: "data:image/png;base64,AAAA" }),
    );
    expect(store.activePage.addElement).not.toHaveBeenCalled();
    expect(store.deleteElements).not.toHaveBeenCalled();
  });

  it("결과가 없으면 src를 건드리지 않고 실패를 알린다", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue(null);
    const { element } = renderPanel(onRemove);

    await user.click(screen.getByRole("button", { name: /bgRemoveRun/ }));

    await waitFor(() =>
      expect(
        screen.getByText("detailPage.properties.bgRemoveFailed"),
      ).toBeTruthy(),
    );
    expect(element.set).not.toHaveBeenCalled();
  });

  it("크레딧 부족 메시지를 그대로 띄운다", async () => {
    const user = userEvent.setup();
    const onRemove = vi
      .fn()
      .mockRejectedValue(new Error("크레딧이 부족해요."));
    renderPanel(onRemove);

    await user.click(screen.getByRole("button", { name: /bgRemoveRun/ }));

    await waitFor(() =>
      expect(screen.getByText("크레딧이 부족해요.")).toBeTruthy(),
    );
  });
});
