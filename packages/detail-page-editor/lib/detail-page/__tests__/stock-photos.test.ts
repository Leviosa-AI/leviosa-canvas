import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchStockPhotoFile,
  mirrorStockPhoto,
  searchStockPhotos,
  type StockPhoto,
} from "../stock-photos";

const PHOTO: StockPhoto = {
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchStockPhotos", () => {
  it("검색어와 쪽수를 우리 서버로 넘긴다 — 키는 브라우저에 없다", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photos: [], hasMore: false, configured: true }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await searchStockPhotos({ query: " 화장품 ", page: 3, perPage: 12 });

    const url = new URL(fetchSpy.mock.calls[0][0] as string, "http://localhost");
    expect(url.pathname).toBe("/api/stock-photos");
    expect(url.searchParams.get("q")).toBe("화장품");
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("per_page")).toBe("12");
  });

  it("검색어가 비면 q를 안 붙인다(큐레이션)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photos: [], hasMore: false, configured: true }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await searchStockPhotos({ query: "   ", page: 1 });

    const url = new URL(fetchSpy.mock.calls[0][0] as string, "http://localhost");
    expect(url.searchParams.has("q")).toBe(false);
  });
});

describe("fetchStockPhotoFile", () => {
  it("원본급 그림을 받아 확장자를 살린 파일로 만든다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["x"], { type: "image/jpeg" }),
      }),
    );

    const file = await fetchStockPhotoFile(PHOTO);

    expect(file.name).toBe("pexels-1108099.jpg");
    expect(file.type).toBe("image/jpeg");
  });
});

describe("mirrorStockPhoto", () => {
  it("업로더가 있으면 우리 주소로 옮겨 담는다 — 문서가 남의 서버에 안 묶인다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["x"], { type: "image/jpeg" }),
      }),
    );
    const uploadFile = vi.fn().mockResolvedValue("https://cdn.leviosa/x.jpg");

    const src = await mirrorStockPhoto(PHOTO, uploadFile);

    expect(src).toBe("https://cdn.leviosa/x.jpg");
    expect(uploadFile).toHaveBeenCalledOnce();
  });

  it("업로더가 없으면 원본 주소를 그대로 쓴다 — 넣는 일은 막지 않는다", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(mirrorStockPhoto(PHOTO)).resolves.toBe(PHOTO.full);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
