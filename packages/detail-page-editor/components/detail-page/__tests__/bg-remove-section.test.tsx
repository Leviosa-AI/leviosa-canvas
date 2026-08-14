import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BgRemoveSection } from "../detail-page-properties-panel";
import type { RemoveBackgroundFn } from "../ai-generate-panel";

// 패널은 이제 소싱 서버를 `DetailPageHost` 로만 만난다 — 가짜 호스트를 꽂고 렌더한다.
import { renderWithDetailPageHost as render } from "./host-stub";

// 누끼는 GIF와 달리 **새 요소를 삽입하지 않는다** — 선택 요소의 src만 갈아 끼운다.
// 그래야 자리·크기·자르기가 그대로 남는다. 테스트는 그 계약을 지킨다.
//
// 이 섹션은 우측 패널이 아니라 **캔버스 위 띠**에서 열린다(`canvas-selection-tools`).
// 어디에 뜨는가는 `selection-actions` 가 정하므로 여기서는 동작만 잰다.

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

function renderSection(onRemoveBackground: ReturnType<typeof vi.fn>) {
  const element = imageElement();
  return {
    element,
    ...render(
      <BgRemoveSection
        el={element as never}
        onRemove={onRemoveBackground as unknown as RemoveBackgroundFn}
        creditCost={1}
      />,
    ),
  };
}

describe("BgRemoveSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("섹션과 크레딧 비용을 노출한다", () => {
    renderSection(vi.fn());
    expect(screen.getByText("detailPage.properties.bgRemove")).toBeTruthy();
    expect(screen.getByRole("button", { name: /bgRemoveRun · 1/ })).toBeTruthy();
  });

  it("컷아웃을 그 자리에서 src로 갈아 끼운다", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue("https://s3/cutout.png");
    const { element } = renderSection(onRemove);

    await user.click(screen.getByRole("button", { name: /bgRemoveRun/ }));

    await waitFor(() =>
      expect(element.set).toHaveBeenCalledWith({ src: "https://s3/cutout.png" }),
    );
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ sourceImage: "data:image/png;base64,AAAA" }),
    );
  });

  it("결과가 없으면 src를 건드리지 않고 실패를 알린다", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue(null);
    const { element } = renderSection(onRemove);

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
    renderSection(onRemove);

    await user.click(screen.getByRole("button", { name: /bgRemoveRun/ }));

    await waitFor(() =>
      expect(screen.getByText("크레딧이 부족해요.")).toBeTruthy(),
    );
  });
});
