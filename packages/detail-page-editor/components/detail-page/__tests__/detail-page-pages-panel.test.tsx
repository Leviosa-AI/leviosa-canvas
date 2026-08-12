import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DetailPagePagesPanel } from "../detail-page-pages-panel";

/**
 * 페이지 배경은 우측 `PageInspector`에도 있지만 **아무것도 선택 안 됐을 때만** 뜬다.
 * 20섹션짜리 문서를 만지는 동안 선택이 비는 순간이 거의 없어서 사실상 안 보였다.
 * 좌측 페이지 행에서 바로 고칠 수 있어야 하고, 쓰기는 우측과 같은 자리여야 한다.
 */

function makePage(id: string, background?: string) {
  return {
    id,
    name: "intro",
    computedWidth: 860,
    computedHeight: 1200,
    children: [],
    ...(background ? { background } : {}),
    set: vi.fn(),
  };
}

function makeStore(pages: ReturnType<typeof makePage>[]) {
  return {
    pages,
    activePage: pages[0],
    selectPage: vi.fn(),
    setPageZIndex: vi.fn(),
  };
}

const swatch = () =>
  screen.getAllByRole("button", { name: "detailPage.pages.background" })[0];

afterEach(() => vi.restoreAllMocks());

describe("DetailPagePagesPanel — 페이지 배경", () => {
  it("페이지마다 배경 스와치를 세운다", () => {
    render(<DetailPagePagesPanel store={makeStore([makePage("p1"), makePage("p2")])} />);

    expect(
      screen.getAllByRole("button", { name: "detailPage.pages.background" }),
    ).toHaveLength(2);
  });

  it("현재 배경색을 스와치에 보여 준다", () => {
    render(<DetailPagePagesPanel store={makeStore([makePage("p1", "#ffeedd")])} />);

    expect(swatch()).toHaveStyle({ background: "#ffeedd" });
  });

  it("누르면 채우기 컨트롤이 열린다", async () => {
    const user = userEvent.setup();
    render(<DetailPagePagesPanel store={makeStore([makePage("p1")])} />);

    expect(swatch()).toHaveAttribute("aria-expanded", "false");
    await user.click(swatch());

    expect(swatch()).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "detailPage.properties.fillGradient" }),
    ).toBeInTheDocument();
  });

  it("우측 인스펙터와 같은 자리에 쓴다 — page.set({background})", async () => {
    const user = userEvent.setup();
    const page = makePage("p1");
    render(<DetailPagePagesPanel store={makeStore([page])} />);

    await user.click(swatch());
    await user.click(
      screen.getByRole("button", { name: "detailPage.properties.fillGradient" }),
    );

    expect(page.set).toHaveBeenCalledWith({
      background: expect.stringContaining("linear-gradient"),
    });
  });

  it("배경을 여는 것이 페이지 선택을 가로채지 않는다", async () => {
    const user = userEvent.setup();
    const store = makeStore([makePage("p1")]);
    render(<DetailPagePagesPanel store={store} />);

    await user.click(swatch());

    // 행 클릭으로 번지면 스와치를 누를 때마다 페이지가 튄다.
    expect(store.selectPage).not.toHaveBeenCalled();
  });
});
