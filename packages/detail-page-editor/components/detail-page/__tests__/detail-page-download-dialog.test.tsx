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

// 움직이는 섹션이 있을 때의 ZIP 경로도 dynamic import 다. gifenc·jszip 없이 무엇을
// 건네는지만 본다.
vi.mock("../../../lib/detail-page-canvas/export/gif-export", () => ({
  exportGifZip: vi.fn(async () => ({ blob: new Blob(["zip"]), unfitted: [] })),
}));

import * as exportFiles from "../../../lib/detail-page-canvas/export/export-files";
import * as gifExport from "../../../lib/detail-page-canvas/export/gif-export";

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
  // jsdom 에는 Blob URL 이 없다. ZIP 내려받기가 부른다.
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => "blob:stub");
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
}

type ToDataURLOpts = { pageId?: string; pixelRatio?: number; mimeType?: string; quality?: number };

function makeStore(pageCount: number, opts: { animated?: boolean } = {}) {
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    id: `p${i}`,
    computedWidth: 750,
    computedHeight: 1000,
  }));
  // 움직이는 섹션 감지는 toJSON 을 훑는다 — 첫 페이지에 GIF 하나를 둔다.
  const doc = {
    width: 750,
    pages: opts.animated
      ? pages.map((p, i) => ({
          id: p.id,
          children: i === 0 ? [{ type: "image", src: "https://s3/x/y.gif" }] : [],
        }))
      : [],
  };
  return {
    pages,
    activePage: pages[0],
    width: 750,
    toDataURL: vi.fn(async (_opts: ToDataURLOpts) => "data:image/png;base64,AAAA"),
    toJSON: vi.fn(() => doc),
  };
}

/**
 * 등록 플랫폼을 고른다. 상세페이지에서는 플랫폼 셀렉트가 첫 combobox 이고, 고르기
 * 전에는 다른 선택지가 아예 없다.
 */
async function choosePlatform(user: ReturnType<typeof userEvent.setup>, label: string) {
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getAllByRole("combobox")[0]);
  await user.click(await screen.findByRole("option", { name: label }));
}

/**
 * Radix Select로 파일 형식을 고른다. 상세페이지에서는 플랫폼 다음(두 번째)
 * combobox 이고, 플랫폼을 안 묻는 캐러셀에서는 첫 번째다.
 */
async function chooseFormat(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  index = 1,
) {
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getAllByRole("combobox")[index]);
  await user.click(await screen.findByRole("option", { name: label }));
}

/** 다이얼로그를 열고 플랫폼까지 고른 상태로 만든다. */
async function openWithPlatform(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByText("editor.download"));
  await choosePlatform(user, label);
  return screen.getByRole("dialog");
}

/** 열려 있는 셀렉트의 옵션 글자들. */
async function optionTexts(user: ReturnType<typeof userEvent.setup>, combobox: HTMLElement) {
  await user.click(combobox);
  const options = await screen.findAllByRole("option");
  const texts = options.map((o) => o.textContent);
  // ESC 는 팝오버까지 닫는다 — 첫 항목을 다시 골라 목록만 접는다.
  await user.click(options[0]);
  return texts;
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

    const dialog = await openWithPlatform(user, "일반(범용)");
    // 3 pages selected (default scope = all)
    expect(within(dialog).getByText(/editor\.pagesCount:3/)).toBeInTheDocument();
    // 750 wide x (3 * 1000) tall at 1x
    expect(within(dialog).getByText(/750 × 3,000 px/)).toBeInTheDocument();
  });

  it("플랫폼을 고르기 전에는 형식도 페이지도 못 고른다", async () => {
    // 폭과 움직이는 이미지 형식이 플랫폼에서 나온다. 그 전에 고른 형식은 거짓말이라
    // 선택지를 아예 안 보여 준다 — 플랫폼 셀렉트 하나와 안내문만 있다.
    const user = userEvent.setup();
    render(<DetailPageDownloadDialog store={makeStore(2)} />);

    await user.click(screen.getByText("editor.download"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("combobox")).toHaveLength(1);
    expect(within(dialog).queryByText("editor.fileFormat")).toBeNull();
    expect(within(dialog).queryByText("editor.downloadAction")).toBeNull();
    expect(within(dialog).getByText("editor.platformFirstHint")).toBeInTheDocument();

    await choosePlatform(user, "네이버 스마트 스토어");
    expect(within(dialog).getByText("editor.fileFormat")).toBeInTheDocument();
    expect(within(dialog).getByText("editor.downloadAction")).toBeInTheDocument();
    expect(within(dialog).queryByText("editor.platformFirstHint")).toBeNull();
  });

  it("플랫폼 폭이 있으면 그 폭으로 그리고, 해상도 슬라이더는 숨긴다", async () => {
    // 750 짜리 문서를 네이버(860px)에 내면 860/750 배로 나간다. 슬라이더를 두면
    // 두 값이 서로 싸우므로 플랫폼 폭이 있을 때는 없앤다.
    const user = userEvent.setup();
    const store = makeStore(2);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<DetailPageDownloadDialog store={store} fileName="my-page" />);

    const dialog = await openWithPlatform(user, "네이버 스마트 스토어");
    expect(within(dialog).queryByText("editor.resolution")).toBeNull();
    expect(within(dialog).getByText(/860 × 2,293 px/)).toBeInTheDocument();
    expect(within(dialog).getByText(/editor\.platformWidthNote/)).toBeInTheDocument();
    expect(within(dialog).getByText(/editor\.platformSizeNote/)).toBeInTheDocument();

    await user.click(within(dialog).getByText("editor.downloadAction"));
    await vi.waitFor(() => expect(store.toDataURL).toHaveBeenCalledTimes(2));
    expect(store.toDataURL).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: "p0", pixelRatio: 860 / 750, mimeType: "image/png" }),
    );
  });

  it("범용은 해상도 슬라이더를 그대로 둔다", async () => {
    const user = userEvent.setup();
    render(<DetailPageDownloadDialog store={makeStore(1)} />);

    const dialog = await openWithPlatform(user, "일반(범용)");
    expect(within(dialog).getByText("editor.resolution")).toBeInTheDocument();
    expect(within(dialog).queryByText(/editor\.platformWidthNote/)).toBeNull();
  });

  it("움직이는 섹션 형식은 플랫폼이 받는 것만 보여 준다", async () => {
    // 쿠팡은 GIF 를 안 받고 WebP 만, 네이버는 WebP 를 안 받는다. MP4 는 jsdom 에
    // VideoEncoder 가 없어 네이버가 허용해도 빠진다.
    const user = userEvent.setup();
    render(<DetailPageDownloadDialog store={makeStore(2, { animated: true })} />);

    const dialog = await openWithPlatform(user, "쿠팡");
    const animationSelect = () => within(dialog).getAllByRole("combobox").at(-1)!;
    expect(within(dialog).getByText("editor.animationFormat")).toBeInTheDocument();
    expect(await optionTexts(user, animationSelect())).toEqual(["editor.animationWebp"]);

    await choosePlatform(user, "네이버 스마트 스토어");
    expect(await optionTexts(user, animationSelect())).toEqual(["editor.animationGif"]);
    expect(within(dialog).getByText("editor.animationGifNote")).toBeInTheDocument();
  });

  it("움직이는 섹션은 플랫폼 폭·용량과 함께 ZIP 으로 나간다", async () => {
    const user = userEvent.setup();
    const store = makeStore(2, { animated: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<DetailPageDownloadDialog store={store} fileName="my-page" />);

    const dialog = await openWithPlatform(user, "네이버 스마트 스토어");
    await user.click(within(dialog).getByText("editor.downloadAction"));

    await vi.waitFor(() => expect(gifExport.exportGifZip).toHaveBeenCalled());
    expect(gifExport.exportGifZip).toHaveBeenCalledWith(
      store,
      expect.objectContaining({
        pageIds: ["p0", "p1"],
        gifFlags: [true, false],
        pixelRatio: 860 / 750,
        animationFormat: "gif",
        animationMaxWidth: 860,
        maxBytes: 20 * 1024 * 1024,
      }),
    );
  });

  it("용량이 상한을 넘으면 화질을 내려 다시 그린다", async () => {
    // 카페24는 장당 5MB. 첫 화질(0.95)로 그린 JPG 가 넘으면 사다리를 내려가며 다시
    // 그리고, 상한 안에 든 첫 결과를 내려받는다.
    const user = userEvent.setup();
    const store = makeStore(1);
    const big = `data:image/jpeg;base64,${"A".repeat(8 * 1024 * 1024)}`;
    const small = "data:image/jpeg;base64,AAAA";
    store.toDataURL.mockImplementation(async (opts) => ((opts.quality ?? 1) >= 0.85 ? big : small));
    const hrefs: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      hrefs.push(this.href);
    });
    render(<DetailPageDownloadDialog store={store} fileName="my-page" />);

    const dialog = await openWithPlatform(user, "카페24");
    await chooseFormat(user, "JPG");
    await user.click(within(dialog).getByText("editor.downloadAction"));

    await vi.waitFor(() => expect(hrefs).toHaveLength(1));
    expect(hrefs[0]).toBe(small);
    const qualities = store.toDataURL.mock.calls.map(([c]) => c.quality);
    expect(qualities).toEqual([0.95, 0.88, 0.8]);
    // 화질만 내렸고 폭은 카페24 규격(800px) 그대로다.
    for (const [c] of store.toDataURL.mock.calls) {
      expect(c.pixelRatio).toBeCloseTo(800 / 750);
    }
    // 상한 안에 들어왔으므로 창이 닫힌다.
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("끝까지 줄여도 넘으면 내려받되 창을 열어 두고 알린다", async () => {
    const user = userEvent.setup();
    const store = makeStore(1);
    store.toDataURL.mockResolvedValue(`data:image/png;base64,${"A".repeat(8 * 1024 * 1024)}`);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<DetailPageDownloadDialog store={store} fileName="my-page" />);

    const dialog = await openWithPlatform(user, "카페24");
    await user.click(within(dialog).getByText("editor.downloadAction"));

    await vi.waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByText(/editor\.sizeUnfitNote/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // PNG 는 화질 손잡이가 없어 크기만 줄인다 — 절반까지.
    const ratios = store.toDataURL.mock.calls.map(([c]) => (c.pixelRatio ?? 0) / (800 / 750));
    expect(ratios.map((r) => Math.round(r * 10) / 10)).toEqual([1, 0.9, 0.8, 0.7, 0.6, 0.5]);
  });

  it("캐러셀도 상세페이지와 같은 형식을 다 보여 주고, 기본은 JPG 다", async () => {
    // 한때 JPG 하나로 좁혀 뒀다. 인스타그램이 JPG 로 받는다는 이유였는데, 내보낸
    // 파일이 곧장 업로드로만 가는 것이 아니다 — 투명 배경은 PNG 가, 다른 도구로
    // 넘겨 손보는 것은 PSD·AI·SVG 가 받는다. 기본값(첫 항목)만 JPG 로 남긴다.
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
      "PNG",
      "editor.formatPsd",
      "editor.formatAi",
      "editor.formatSvg",
    ]);
    await user.click(screen.getByRole("option", { name: "JPG" }));
    await user.click(within(dialog).getByText("editor.downloadAction"));

    await vi.waitFor(() => expect(store.toDataURL).toHaveBeenCalled());
    expect(store.toDataURL).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "image/jpeg" }),
    );
  });

  it("캐러셀은 등록 플랫폼을 안 묻고, 파일명에도 안 붙인다", async () => {
    // 캐러셀은 인스타그램 한 곳으로만 나간다. 고를 것이 없는 목록을 남겨 두면
    // 접미사만 거짓말을 한다 — `-naver` 가 붙은 인스타그램 이미지.
    const user = userEvent.setup();
    selectDetailPageEditorProfile({ kind: "carousel" });
    render(<DetailPageDownloadDialog store={makeStore(2)} fileName="my-plates" />);

    await user.click(screen.getByText("editor.download"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("editor.registerPlatform")).toBeNull();

    await chooseFormat(user, "editor.formatPsd", 0);
    await user.click(within(dialog).getByText("editor.downloadAction"));
    await vi.waitFor(() =>
      expect(exportFiles.downloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        "my-plates.psd",
      ),
    );
  });

  it("저장 버튼과 목록 판을 편집기 토큰으로 칠한다", async () => {
    // 소비자 앱(leviosa-agency)에는 `--color-primary-foreground` 도 `--color-popover`
    // 도 없다. 그 이름을 부르면 Tailwind 가 클래스를 아예 안 굽는다 — 저장 버튼은
    // 글자색이 본문(먹)을 물려받아 배경(`le-ink-900`, 같은 앱에서 먹)과 같아지고,
    // 목록 판은 투명해져 뒤의 라벨과 겹친다. 화면으로만 보이는 종류라 여기서 못박는다.
    const user = userEvent.setup();
    render(<DetailPageDownloadDialog store={makeStore(1)} />);

    const dialog = await openWithPlatform(user, "일반(범용)");

    const action = within(dialog).getByText("editor.downloadAction").closest("button")!;
    expect(action.className).toContain("text-le-on-accent");
    expect(action.className).not.toMatch(/text-primary-foreground|bg-primary\b/);

    await user.click(within(dialog).getAllByRole("combobox")[0]);
    const listbox = await screen.findByRole("listbox");
    expect(listbox.className).toContain("bg-le-surface");
    expect(listbox.className).not.toMatch(/bg-popover|popover-foreground/);
  });

  it("상세페이지는 등록 플랫폼을 계속 묻는다", async () => {
    const user = userEvent.setup();
    render(<DetailPageDownloadDialog store={makeStore(1)} />);

    await user.click(screen.getByText("editor.download"));
    expect(
      within(screen.getByRole("dialog")).getByText("editor.registerPlatform"),
    ).toBeInTheDocument();
  });

  it("exports each page via store.toDataURL and triggers a download", async () => {
    const user = userEvent.setup();
    const store = makeStore(1);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(<DetailPageDownloadDialog store={store} fileName="my-page" />);

    const dialog = await openWithPlatform(user, "일반(범용)");
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
    await openWithPlatform(user, "네이버 스마트 스토어");
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
    await openWithPlatform(user, "네이버 스마트 스토어");
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
    await openWithPlatform(user, "네이버 스마트 스토어");
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
    await openWithPlatform(user, "네이버 스마트 스토어");
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
