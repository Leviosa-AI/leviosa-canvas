import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockSearch, mockMirror, mockInsert } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockMirror: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock("../../../lib/detail-page/stock-photos", () => ({
  searchStockPhotos: (...args: unknown[]) => mockSearch(...args),
  mirrorStockPhoto: (...args: unknown[]) => mockMirror(...args),
}));
vi.mock("../../../lib/detail-page/insert-image", () => ({
  insertPersonalImage: (...args: unknown[]) => mockInsert(...args),
}));

import { DetailPagePhotosPanel } from "../detail-page-photos-panel";
import { renderWithDetailPageHost as render } from "./host-stub";

const PHOTO = {
  id: "1108099",
  thumb: "https://images.pexels.com/photos/1108099/x.jpeg?h=350",
  full: "https://images.pexels.com/photos/1108099/x.jpeg?w=1880",
  width: 4000,
  height: 6000,
  alt: "화장품",
  photographer: "Jane Doe",
  photographerUrl: "https://www.pexels.com/@jane",
  pageUrl: "https://www.pexels.com/photo/x-1108099/",
};

function renderPanel(uploadFile?: (file: File) => Promise<string>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DetailPagePhotosPanel store={{ pages: [] }} uploadFile={uploadFile} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("DetailPagePhotosPanel", () => {
  it("검색어 없이도 고를 거리를 먼저 보여준다", async () => {
    mockSearch.mockResolvedValue({
      photos: [PHOTO],
      hasMore: false,
      configured: true,
    });

    renderPanel();

    expect(await screen.findByAltText("화장품")).toBeInTheDocument();
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: "", page: 1 }),
    );
  });

  it("고른 사진은 우리 주소로 옮겨 담은 뒤 얹는다", async () => {
    mockSearch.mockResolvedValue({
      photos: [PHOTO],
      hasMore: false,
      configured: true,
    });
    mockMirror.mockResolvedValue("https://cdn.leviosa/mirrored.jpg");
    const uploadFile = vi.fn();

    renderPanel(uploadFile);
    const tile = await screen.findByAltText("화장품");
    await userEvent.click(tile);

    await waitFor(() => {
      expect(mockMirror).toHaveBeenCalledWith(PHOTO, uploadFile);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.anything(),
        "https://cdn.leviosa/mirrored.jpg",
      );
    });
  });

  it("출처 표기(제공처·작가)를 띄운다 — 이용 조건이 요구한다", async () => {
    mockSearch.mockResolvedValue({
      photos: [PHOTO],
      hasMore: false,
      configured: true,
    });

    renderPanel();
    // 제공처 링크는 정적이라 사진보다 먼저 잡힌다 — 격자가 뜬 뒤에 함께 본다.
    await screen.findByAltText("화장품");

    // 문구는 번역 파일이 정본이라 여기서는 키로 잡는다(photos-locales.test.ts가 이름을 지킨다).
    const credit = await screen.findByRole("link", {
      name: "detailPage.photos.stockCredit",
    });
    expect(credit).toHaveAttribute("href", "https://www.pexels.com");
    expect(screen.getByRole("link", { name: "Jane Doe" })).toHaveAttribute(
      "href",
      PHOTO.pageUrl,
    );
  });

  it("검색어를 치면 그 말로 다시 찾는다", async () => {
    mockSearch.mockResolvedValue({
      photos: [],
      hasMore: false,
      configured: true,
    });

    renderPanel();
    await screen.findByRole("searchbox");
    await userEvent.type(screen.getByRole("searchbox"), "욕실");

    await waitFor(
      () => {
        expect(mockSearch).toHaveBeenCalledWith(
          expect.objectContaining({ query: "욕실" }),
        );
      },
      { timeout: 3000 },
    );
  });

  it("서버에 키가 없으면 오류 대신 안내를 띄우고 올리기는 남긴다", async () => {
    mockSearch.mockResolvedValue({
      photos: [],
      hasMore: false,
      configured: false,
    });

    renderPanel(vi.fn());

    expect(
      await screen.findByText("detailPage.photos.stockUnavailable"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "detailPage.photos.upload" }),
    ).toBeEnabled();
  });
});
