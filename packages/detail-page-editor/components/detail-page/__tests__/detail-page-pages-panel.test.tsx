import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DetailPagePagesPanel } from "../detail-page-pages-panel";
import { selectDetailPageEditorProfile } from "../../../lib/detail-page/editor-profile";

/**
 * 판 목록 행의 오른쪽 자리. 예전엔 배경 스와치였는데, 판을 고르지 않고도 바로
 * 복제·삭제하는 쪽이 훨씬 자주 쓰여서 그 자리를 내줬다.
 */

function makePage(id: string) {
  return {
    id,
    name: "intro",
    computedWidth: 860,
    computedHeight: 1200,
    children: [],
    set: vi.fn(),
    clone: vi.fn(),
  };
}

function makeStore(pages: ReturnType<typeof makePage>[]) {
  return {
    pages,
    activePage: pages[0],
    selectPage: vi.fn(),
    addPage: vi.fn(() => ({ id: "new", setZIndex: vi.fn() })),
    deletePages: vi.fn(),
  };
}

const dupButtons = () =>
  screen.getAllByRole("button", { name: "detailPage.pageToolbar.duplicate" });
const delButtons = () =>
  screen.getAllByRole("button", { name: "detailPage.pageToolbar.delete" });

afterEach(() => {
  vi.restoreAllMocks();
  selectDetailPageEditorProfile({});
});

describe("DetailPagePagesPanel — 판 복제/삭제", () => {
  it("행마다 복제·삭제 버튼을 둔다", () => {
    render(
      <DetailPagePagesPanel
        store={makeStore([makePage("p1"), makePage("p2")])}
      />,
    );

    expect(dupButtons()).toHaveLength(2);
    expect(delButtons()).toHaveLength(2);
  });

  it("복제는 그 판을 복제하고 행 선택으로 번지지 않는다", async () => {
    const user = userEvent.setup();
    const page = makePage("p1");
    const store = makeStore([page, makePage("p2")]);
    render(<DetailPagePagesPanel store={store} />);

    await user.click(dupButtons()[0]);

    expect(page.clone).toHaveBeenCalled();
    expect(store.selectPage).not.toHaveBeenCalled();
  });

  it("삭제는 그 판의 id만 넘긴다", async () => {
    const user = userEvent.setup();
    const store = makeStore([makePage("p1"), makePage("p2")]);
    render(<DetailPagePagesPanel store={store} />);

    await user.click(delButtons()[1]);

    expect(store.deletePages).toHaveBeenCalledWith(["p2"]);
  });

  it("마지막 한 장은 삭제할 수 없다", () => {
    render(<DetailPagePagesPanel store={makeStore([makePage("p1")])} />);

    expect(delButtons()[0]).toBeDisabled();
  });

  it("판 수가 상한이면 복제를 막는다", () => {
    selectDetailPageEditorProfile({ kind: "carousel" });
    render(
      <DetailPagePagesPanel
        store={makeStore(
          Array.from({ length: 10 }, (_, i) => makePage(`p${i}`)),
        )}
      />,
    );

    expect(dupButtons()[0]).toBeDisabled();
  });
});

describe("DetailPagePagesPanel — 화면 끼우기", () => {
  it("화면 사이마다 끼울 자리를 둔다", () => {
    render(
      <DetailPagePagesPanel
        store={makeStore([makePage("p1"), makePage("p2")])}
      />,
    );

    expect(
      screen.getAllByRole("button", {
        name: "detailPage.pageToolbar.addBelow",
      }),
    ).toHaveLength(2);
  });

  it("누른 자리 바로 뒤에 넣는다", async () => {
    const user = userEvent.setup();
    const store = makeStore([makePage("p1"), makePage("p2")]);
    render(<DetailPagePagesPanel store={store} />);

    await user.click(
      screen.getAllByRole("button", {
        name: "detailPage.pageToolbar.addBelow",
      })[0],
    );
    expect(store.addPage).toHaveBeenCalledWith({ width: 860, height: 1200 });
    expect(store.selectPage).toHaveBeenCalledWith("new");
  });

  it("캐러셀은 1080×1350 판만 넣고 10장에서 자리를 감춘다", async () => {
    const user = userEvent.setup();
    selectDetailPageEditorProfile({ kind: "carousel" });
    const store = makeStore(
      Array.from({ length: 9 }, (_, i) => makePage(`p${i}`)),
    );
    const view = render(<DetailPagePagesPanel store={store} />);

    await user.click(
      screen.getAllByRole("button", {
        name: "detailPage.pageToolbar.addBelow",
      })[0],
    );
    expect(store.addPage).toHaveBeenCalledWith({ width: 1080, height: 1350 });

    view.unmount();
    render(
      <DetailPagePagesPanel
        store={makeStore(
          Array.from({ length: 10 }, (_, i) => makePage(`q${i}`)),
        )}
      />,
    );
    expect(
      screen.queryAllByRole("button", {
        name: "detailPage.pageToolbar.addBelow",
      }),
    ).toHaveLength(0);
  });
});
