import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CanvasInsertToolbar } from "../canvas-insert-toolbar";

/**
 * 캔버스 아래 삽입 띠.
 *
 * 재는 것은 하나다 — **좌측 패널과 같은 함수를 부르는가**. 넣는 크기·자리 규칙이 두 벌로
 * 갈라지는 것이 이 기능에서 가장 흔한 사고이고, 그건 눈으로는 한참 뒤에야 보인다.
 */

function makeStore() {
  const page = {
    id: "p1",
    computedWidth: 1000,
    computedHeight: 1400,
    addElement: vi.fn((props: Record<string, unknown>) => ({ id: "new1", ...props })),
  };
  return {
    pages: [page],
    activePage: page,
    selectElements: vi.fn(),
    openSidePanel: vi.fn(),
    page,
  };
}

describe("CanvasInsertToolbar", () => {
  it("텍스트 버튼은 본문 글상자를 넣고 그것을 고른다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    render(<CanvasInsertToolbar store={store} />);

    await user.click(screen.getByRole("button", { name: "detailPage.insert.text" }));

    expect(store.page.addElement).toHaveBeenCalledTimes(1);
    const props = store.page.addElement.mock.calls[0][0] as Record<string, unknown>;
    expect(props.type).toBe("text");
    expect(props.fontSize).toBe(18);
    expect(store.selectElements).toHaveBeenCalledWith(["new1"]);
  });

  it("드롭다운에서 크기를 고르면 그 크기로 들어간다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    render(<CanvasInsertToolbar store={store} />);

    await user.click(screen.getByRole("button", { name: "detailPage.insert.text …" }));
    await user.click(screen.getByText("detailPage.text.heading"));

    const props = store.page.addElement.mock.calls[0][0] as Record<string, unknown>;
    expect(props.fontSize).toBe(48);
    // 고르고 나면 목록은 닫힌다.
    expect(screen.queryByText("detailPage.text.heading")).toBeNull();
  });

  it("도형 버튼은 네이티브 네모를 넣는다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    render(<CanvasInsertToolbar store={store} />);

    await user.click(screen.getByRole("button", { name: "detailPage.insert.shape" }));

    const props = store.page.addElement.mock.calls[0][0] as Record<string, unknown>;
    expect(props.type).toBe("figure");
    expect(props.subType).toBe("rect");
  });

  it("동그라미는 subType으로, 카탈로그 도형은 svg로 들어간다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    render(<CanvasInsertToolbar store={store} />);

    await user.click(screen.getByRole("button", { name: "detailPage.insert.shape …" }));
    await user.click(screen.getByText("detailPage.shapes.basic.circle"));
    expect(
      (store.page.addElement.mock.calls[0][0] as Record<string, unknown>).subType,
    ).toBe("circle");

    await user.click(screen.getByRole("button", { name: "detailPage.insert.shape …" }));
    await user.click(screen.getByText("detailPage.shapes.basic.triangle"));
    const svgProps = store.page.addElement.mock.calls[1][0] as Record<string, unknown>;
    expect(svgProps.type).toBe("svg");
    expect(String(svgProps.src)).toContain("data:image/svg+xml");
  });

  it("카탈로그 전체는 좌측 패널로 데려간다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    render(<CanvasInsertToolbar store={store} />);

    await user.click(screen.getByRole("button", { name: "detailPage.insert.shape …" }));
    await user.click(screen.getByText("detailPage.insert.moreShapes"));

    expect(store.openSidePanel).toHaveBeenCalledWith("elements");
    expect(store.page.addElement).not.toHaveBeenCalled();
  });
});
