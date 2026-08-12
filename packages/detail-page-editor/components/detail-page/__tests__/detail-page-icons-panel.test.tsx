import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSearch = vi.fn();
const mockInsert = vi.fn();
const mockRemember = vi.fn();

vi.mock("../../../lib/detail-page/icons", () => ({
  searchIcons: (...args: unknown[]) => mockSearch(...args),
}));
vi.mock("../../../lib/detail-page/insert-shape", () => ({
  insertShape: (...args: unknown[]) => mockInsert(...args),
}));
vi.mock("../../../lib/detail-page/element-recents", () => ({
  rememberElement: (...args: unknown[]) => mockRemember(...args),
}));

import { DetailPageIconsPanel } from "../detail-page-icons-panel";
import { renderWithDetailPageHost } from "./host-stub";

const STORE = { pages: [] };

const TRUCK = {
  id: "lucide:truck",
  style: "stroke" as const,
  markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path stroke="currentColor" d="M1 1"/></svg>`,
  viewBox: "0 0 24 24",
  setName: "Lucide",
  license: "ISC",
};

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderWithDetailPageHost(
    <QueryClientProvider client={client}>
      <DetailPageIconsPanel store={STORE} />
    </QueryClientProvider>,
    { brand: { useBrandPrimaryColor: () => "#0055ff" } },
  );
}

beforeEach(() => {
  mockSearch.mockResolvedValue({
    items: [TRUCK],
    group: "icons",
    page: 0,
    hasMore: false,
    truncated: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("DetailPageIconsPanel", () => {
  it("검색어 없이 열면 큐레이션을 받아 격자에 뿌린다", async () => {
    renderPanel();

    expect(await screen.findByRole("button", { name: "lucide:truck" })).toBeInTheDocument();
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: "", group: "icons", style: "stroke" }),
    );
  });

  it("미리보기를 실제로 넣을 색으로 그린다 — 눌러 보고 다른 색이 나오면 안 된다", async () => {
    renderPanel();

    const cell = await screen.findByRole("button", { name: "lucide:truck" });
    // 마크업은 base64 data URI 로 실린다.
    const src = atob(
      (cell.querySelector("img")?.getAttribute("src") ?? "").split(",")[1] ?? "",
    );
    expect(src).toContain("#0055ff");
    expect(src).not.toContain("currentColor");
  });

  it("누르면 브랜드 색이 박힌 마크업으로 삽입하고 최근에 남긴다", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "lucide:truck" }));

    expect(mockInsert).toHaveBeenCalledOnce();
    const [store, markup, viewBox] = mockInsert.mock.calls[0];
    expect(store).toBe(STORE);
    expect(markup).toContain("#0055ff");
    expect(viewBox).toBe("0 0 24 24");
    expect(mockRemember).toHaveBeenCalledWith(
      expect.objectContaining({ key: "lucide:truck", label: "truck" }),
    );
  });

  it("스타일 축을 바꾸면 그 축으로 다시 찾는다", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("button", { name: "lucide:truck" });

    await user.click(screen.getByRole("button", { name: "detailPage.icons.styleFill" }));

    await waitFor(() =>
      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({ style: "fill" }),
      ),
    );
  });

  it("브랜드 로고 그룹에는 스타일 축이 없고 상표 안내가 붙는다", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("button", { name: "lucide:truck" });

    await user.click(screen.getByRole("button", { name: "detailPage.icons.groupLogos" }));

    expect(screen.getByText("detailPage.icons.logoTrademark")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "detailPage.icons.styleStroke" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({ group: "logos", style: undefined }),
      ),
    );
  });

  it("한 글자마다 찾지 않고 디바운스해서 넘긴다", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("button", { name: "lucide:truck" });

    await user.type(screen.getByLabelText("detailPage.icons.searchLabel"), "배송");
    // 타이핑 직후에는 아직 안 나간다.
    expect(mockSearch).not.toHaveBeenCalledWith(
      expect.objectContaining({ query: "배송" }),
    );

    await waitFor(
      () =>
        expect(mockSearch).toHaveBeenCalledWith(
          expect.objectContaining({ query: "배송" }),
        ),
      { timeout: 2000 },
    );
    // 두 글자를 쳤어도 질의는 한 번만 나간다("배"로는 안 찾는다).
    expect(
      mockSearch.mock.calls.filter(
        (call) => (call[0] as { query: string }).query === "배",
      ),
    ).toHaveLength(0);
  });

  it("결과가 없으면 안내를 띄운다", async () => {
    mockSearch.mockResolvedValue({
      items: [],
      group: "icons",
      page: 0,
      hasMore: false,
      truncated: false,
    });
    renderPanel();

    expect(await screen.findByText("detailPage.icons.empty")).toBeInTheDocument();
  });

  it("잘렸으면 조용히 넘기지 않고 알린다", async () => {
    mockSearch.mockResolvedValue({
      items: [TRUCK],
      group: "icons",
      page: 0,
      hasMore: false,
      truncated: true,
    });
    renderPanel();

    expect(await screen.findByText("detailPage.icons.truncated")).toBeInTheDocument();
  });

  it("다음 쪽이 있으면 이어 받아 격자에 덧붙인다", async () => {
    // 첫 96개로 끝나면 스크롤해도 더 안 나온다. 관찰이 안 되는 환경에서도
    // 이어 받을 수 있게 "더 보기" 버튼이 남는다.
    const second = { ...TRUCK, id: "tabler:box" };
    mockSearch.mockImplementation(async ({ page = 0 }: { page?: number }) => ({
      items: [page === 0 ? TRUCK : second],
      group: "icons",
      page,
      hasMore: page === 0,
      truncated: false,
    }));
    const user = userEvent.setup();
    renderPanel();

    await screen.findByRole("button", { name: "lucide:truck" });
    expect(screen.queryByRole("button", { name: "tabler:box" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "detailPage.icons.loadMore" }));

    expect(await screen.findByRole("button", { name: "tabler:box" })).toBeInTheDocument();
    // 앞 쪽은 그대로 남는다 — 스크롤이 위로 튀면 고르던 자리를 잃는다.
    expect(screen.getByRole("button", { name: "lucide:truck" })).toBeInTheDocument();
    expect(mockSearch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });

  it("마지막 쪽에서는 더 보기를 안 남긴다", async () => {
    renderPanel();

    await screen.findByRole("button", { name: "lucide:truck" });
    expect(
      screen.queryByRole("button", { name: "detailPage.icons.loadMore" }),
    ).not.toBeInTheDocument();
  });

  it("채움으로 바꾸면 그 축으로 다시 묻는다", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByRole("button", { name: "lucide:truck" });
    await user.click(screen.getByRole("button", { name: "detailPage.icons.styleFill" }));

    await waitFor(() =>
      expect(mockSearch).toHaveBeenLastCalledWith(
        expect.objectContaining({ style: "fill", page: 0 }),
      ),
    );
  });

  it("실패하면 오류 문구를 띄운다", async () => {
    mockSearch.mockRejectedValue(new Error("icons 502"));
    renderPanel();

    expect(await screen.findByText("detailPage.icons.failed")).toBeInTheDocument();
  });
});
