import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DetailPageDownloadDialog } from "../detail-page-download-dialog";
import { selectDetailPageEditorProfile } from "../../../lib/detail-page/editor-profile";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) =>
      opts && typeof opts.count === "number" ? `${key}:${opts.count}` : key,
  }),
}));

// PSD/SVG 내보내기는 다이얼로그가 dynamic import 하는 모듈에 위임한다 — vitest의
// vi.mock은 dynamic import도 가로채므로 무거운 ag-psd 없이 흐름만 검증한다.
vi.mock("../../../lib/detail-page-canvas/export/export-files", () => ({
  exportPsdBlob: vi.fn(async () => new Blob(["psd"])),
  exportSvgBlobs: vi.fn(async () => [new Blob(["svg"])]),
  exportAiBlob: vi.fn(async () => new Blob(["ai"])),
  downloadBlob: vi.fn(),
}));

import * as exportFiles from "../../../lib/detail-page-canvas/export/export-files";

// 패널은 이제 소싱 서버를 `DetailPageHost` 로만 만난다 — 가짜 호스트를 꽂고 렌더한다.
import { renderWithDetailPageHost as render } from "./host-stub";


// Radix Select needs a couple of DOM APIs jsdom lacks; the dialog itself does not
// depend on them for the assertions below, so stub them harmlessly.
beforeEachStubs();
function beforeEachStubs() {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
}

function makeStore(pageCount: number) {
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    id: `p${i}`,
    computedWidth: 750,
    computedHeight: 1000,
  }));
  return {
    pages,
    activePage: pages[0],
    width: 750,
    toDataURL: vi.fn(async () => "data:image/png;base64,AAAA"),
    toJSON: vi.fn(() => ({ width: 750, pages: [] })),
  };
}

/** Radix Select로 파일 형식을 고른다(형식 셀렉트가 다이얼로그의 첫 combobox). */
async function chooseFormat(user: ReturnType<typeof userEvent.setup>, label: string) {
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getAllByRole("combobox")[0]);
  await user.click(await screen.findByRole("option", { name: label }));
}

describe("DetailPageDownloadDialog", () => {
  afterEach(() => {
    selectDetailPageEditorProfile({});
    vi.restoreAllMocks();
  });

  it("toggles the popover open and closed", async () => {
    const user = userEvent.setup();
    render(<DetailPageDownloadDialog store={makeStore(1)} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByText("editor.download"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByLabelText("editor.close"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reports the page count and output px for the document", async () => {
    const user = userEvent.setup();
    render(<DetailPageDownloadDialog store={makeStore(3)} />);

    await user.click(screen.getByText("editor.download"));
    const dialog = screen.getByRole("dialog");
    // 3 pages selected (default scope = all)
    expect(within(dialog).getByText(/editor\.pagesCount:3/)).toBeInTheDocument();
    // 750 wide x (3 * 1000) tall at 1x
    expect(within(dialog).getByText(/750 × 3,000 px/)).toBeInTheDocument();
  });

  it("캐러셀은 JPG 하나만 보여 주고 그것을 기본으로 내보낸다", async () => {
    const user = userEvent.setup();
    const store = makeStore(1);
    selectDetailPageEditorProfile({ kind: "carousel" });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<DetailPageDownloadDialog store={store} />);

    await user.click(screen.getByText("editor.download"));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getAllByRole("combobox")[0]);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "JPG",
    ]);
    await user.click(screen.getByRole("option", { name: "JPG" }));
    await user.click(within(dialog).getByText("editor.downloadAction"));

    await vi.waitFor(() => expect(store.toDataURL).toHaveBeenCalled());
    expect(store.toDataURL).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "image/jpeg" }),
    );
  });

  it("exports each page via store.toDataURL and triggers a download", async () => {
    const user = userEvent.setup();
    const store = makeStore(1);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(<DetailPageDownloadDialog store={store} fileName="my-page" />);

    await user.click(screen.getByText("editor.download"));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByText("editor.downloadAction"));

    await vi.waitFor(() => expect(store.toDataURL).toHaveBeenCalled());
    expect(store.toDataURL).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: "p0", pixelRatio: 1, mimeType: "image/png" }),
    );
    await vi.waitFor(() => expect(clickSpy).toHaveBeenCalled());
  });

  it("psd: hides raster-only controls and delegates to exportPsdBlob", async () => {
    const user = userEvent.setup();
    const store = makeStore(2);
    render(
      <DetailPageDownloadDialog
        store={store}
        fileName="my-page"
        slotBindings={{ "p1.title": { element_id: "e1" } }}
      />,
    );
    await user.click(screen.getByText("editor.download"));
    await chooseFormat(user, "editor.formatPsd");

    const dialog = screen.getByRole("dialog");
    // PSD는 항상 한 파일 + 문서 픽셀 고정이라 병합/해상도 컨트롤이 사라진다.
    expect(within(dialog).queryByText("editor.resolution")).toBeNull();
    expect(within(dialog).queryByText("editor.mergeSingle")).toBeNull();
    expect(within(dialog).getByText(/editor\.psdNote/)).toBeInTheDocument();

    await user.click(within(dialog).getByText("editor.downloadAction"));
    await vi.waitFor(() => expect(exportFiles.exportPsdBlob).toHaveBeenCalled());
    expect(exportFiles.exportPsdBlob).toHaveBeenCalledWith(
      { width: 750, pages: [] },
      expect.objectContaining({
        pageIds: ["p0", "p1"],
        slotBindings: { "p1.title": { element_id: "e1" } },
      }),
    );
    await vi.waitFor(() =>
      expect(exportFiles.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "my-page-naver.psd"),
    );
  });

  it("svg: shows vector info and delegates to exportSvgBlobs", async () => {
    const user = userEvent.setup();
    render(<DetailPageDownloadDialog store={makeStore(2)} fileName="my-page" />);
    await user.click(screen.getByText("editor.download"));
    await chooseFormat(user, "editor.formatSvg");

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("editor.resolution")).toBeNull();
    expect(within(dialog).getByText("editor.mergeSingleFile")).toBeInTheDocument();
    expect(within(dialog).getByText(/editor\.vectorOutput/)).toBeInTheDocument();
    expect(within(dialog).getByText(/editor\.svgNote/)).toBeInTheDocument();

    await user.click(within(dialog).getByText("editor.downloadAction"));
    await vi.waitFor(() =>
      expect(exportFiles.exportSvgBlobs).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ merged: true, pageIds: ["p0", "p1"] }),
      ),
    );
    await vi.waitFor(() =>
      expect(exportFiles.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "my-page-naver.svg"),
    );
  });

  it("ai: shows vector info and delegates to exportAiBlob", async () => {
    const user = userEvent.setup();
    render(<DetailPageDownloadDialog store={makeStore(2)} fileName="my-page" />);
    await user.click(screen.getByText("editor.download"));
    await chooseFormat(user, "editor.formatAi");

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("editor.resolution")).toBeNull();
    expect(within(dialog).getByText("editor.mergeArtboard")).toBeInTheDocument();
    expect(within(dialog).getByText(/editor\.vectorOutput/)).toBeInTheDocument();
    expect(within(dialog).getByText(/editor\.aiNote/)).toBeInTheDocument();

    await user.click(within(dialog).getByText("editor.downloadAction"));
    await vi.waitFor(() =>
      expect(exportFiles.exportAiBlob).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ merged: true, pageIds: ["p0", "p1"] }),
      ),
    );
    await vi.waitFor(() =>
      expect(exportFiles.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "my-page-naver.ai"),
    );
  });

  it("ai: falls back to one artboard per page past the artboard limit, and says so", async () => {
    const user = userEvent.setup();
    // 17 pages × 1000px overshoots Illustrator's 16,383px artboard; merging
    // there would produce a file Illustrator refuses to open.
    render(<DetailPageDownloadDialog store={makeStore(17)} fileName="my-page" />);
    await user.click(screen.getByText("editor.download"));
    await chooseFormat(user, "editor.formatAi");

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/editor\.aiOverflowNote/)).toBeInTheDocument();

    await user.click(within(dialog).getByText("editor.downloadAction"));
    await vi.waitFor(() =>
      expect(exportFiles.exportAiBlob).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ merged: false }),
      ),
    );
  });
});
