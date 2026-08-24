import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DetailPagePageToolbar } from "../detail-page-page-toolbar";
import { selectDetailPageEditorProfile } from "../../../lib/detail-page/editor-profile";

/**
 * The toolbar mirrors the stock editor's stock page-controls. We assert each button wires
 * to the right store/page action (reorder / duplicate / add / delete / AI), with
 * the toolbar targeting the page it was handed.
 */
function makeStore() {
  const mkPage = (id: string) => ({
    id,
    bleed: 0,
    width: 1080,
    height: 1920,
    setZIndex: vi.fn(),
    clone: vi.fn(),
  });
  const pages = [mkPage("a"), mkPage("b"), mkPage("c")];
  const added = { setZIndex: vi.fn() };
  const store = {
    pages,
    activePage: pages[1],
    addPage: vi.fn(() => added),
    deletePages: vi.fn(),
    openSidePanel: vi.fn(),
  };
  return { store, pages, added };
}

describe("DetailPagePageToolbar", () => {
  afterEach(() => {
    selectDetailPageEditorProfile({});
    vi.restoreAllMocks();
  });

  it("moves the page up / down via setZIndex", async () => {
    const user = userEvent.setup();
    const { store, pages } = makeStore();
    render(<DetailPagePageToolbar store={store} page={pages[1]} />);

    await user.click(screen.getByLabelText("detailPage.pageToolbar.moveUp"));
    expect(pages[1].setZIndex).toHaveBeenCalledWith(0);

    await user.click(screen.getByLabelText("detailPage.pageToolbar.moveDown"));
    expect(pages[1].setZIndex).toHaveBeenCalledWith(2);
  });

  it("duplicates via page.clone()", async () => {
    const user = userEvent.setup();
    const { store, pages } = makeStore();
    render(<DetailPagePageToolbar store={store} page={pages[1]} />);

    await user.click(screen.getByLabelText("detailPage.pageToolbar.duplicate"));
    expect(pages[1].clone).toHaveBeenCalledOnce();
  });

  it("adds a new page right after the current one", async () => {
    const user = userEvent.setup();
    const { store, added } = makeStore();
    render(<DetailPagePageToolbar store={store} page={store.pages[1]} />);

    await user.click(screen.getByLabelText("detailPage.pageToolbar.addBelow"));
    expect(store.addPage).toHaveBeenCalledOnce();
    expect(added.setZIndex).toHaveBeenCalledWith(2);
  });

  it("캐러셀은 1080×1350 판만 추가하고 10장에서 막는다", async () => {
    const user = userEvent.setup();
    selectDetailPageEditorProfile({ kind: "carousel" });
    const { store } = makeStore();
    store.pages = Array.from({ length: 9 }, (_, i) => ({
      ...store.pages[0],
      id: `p${i}`,
    }));
    store.activePage = store.pages[4];
    const { unmount } = render(
      <DetailPagePageToolbar store={store} page={store.activePage} />,
    );

    await user.click(screen.getByLabelText("detailPage.pageToolbar.addBelow"));
    expect(store.addPage).toHaveBeenCalledWith({
      bleed: 0,
      width: 1080,
      height: 1350,
    });

    store.pages.push({ ...store.pages[0], id: "p9" });
    unmount();
    render(<DetailPagePageToolbar store={store} page={store.activePage} />);
    expect(screen.getByLabelText("detailPage.pageToolbar.addBelow")).toBeDisabled();
    expect(screen.getByLabelText("detailPage.pageToolbar.duplicate")).toBeDisabled();
  });

  it("deletes the page via store.deletePages", async () => {
    const user = userEvent.setup();
    const { store, pages } = makeStore();
    render(<DetailPagePageToolbar store={store} page={pages[1]} />);

    await user.click(screen.getByLabelText("detailPage.pageToolbar.delete"));
    expect(store.deletePages).toHaveBeenCalledWith(["b"]);
  });

  it("opens the AI panel", async () => {
    const user = userEvent.setup();
    const { store, pages } = makeStore();
    render(<DetailPagePageToolbar store={store} page={pages[1]} />);

    await user.click(screen.getByLabelText("detailPage.pageToolbar.aiGenerate"));
    expect(store.openSidePanel).toHaveBeenCalledWith("ai-generate");
  });

  it("disables move-up on the first page and delete on a lone page", async () => {
    const { store, pages } = makeStore();
    const { rerender } = render(
      <DetailPagePageToolbar store={store} page={pages[0]} />,
    );
    expect(screen.getByLabelText("detailPage.pageToolbar.moveUp")).toBeDisabled();

    const lone = makeStore();
    lone.store.pages = [lone.pages[0]];
    rerender(<DetailPagePageToolbar store={lone.store} page={lone.pages[0]} />);
    expect(screen.getByLabelText("detailPage.pageToolbar.delete")).toBeDisabled();
  });
});
