import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockList = vi.fn();
const mockInsert = vi.fn();

vi.mock("../../../lib/detail-page/insert-image", () => ({
  insertPersonalImage: (...args: unknown[]) => mockInsert(...args),
}));

import {
  DetailPageBrandGifsPanel,
  groupBrandGifs,
} from "../detail-page-brand-gifs-panel";
import type { BrandAsset } from "../detail-page-host-context";
import { renderWithDetailPageHost } from "./host-stub";

const brandWorkspace = () => ({
  brands: [{ id: "brand-1", name: "levi&osa", ownedCompanyId: "company-1", revision: 1 }],
  activeBrand: { id: "brand-1", name: "levi&osa", ownedCompanyId: "company-1", revision: 1 },
  activeBrandId: "brand-1",
  setActiveBrandId: vi.fn(),
  isLoading: false,
  error: null,
});

const BRAND = {
  listBrandAssets: (...args: unknown[]) => mockList(...args),
  brandAssetDocumentSrc: (asset: { stable_path?: string; download_url?: string | null }) =>
    asset.stable_path || asset.download_url || "",
  useBrandWorkspace: brandWorkspace,
};

function gif(id: string, gifKind: string | null, extra = {}) {
  return {
    id,
    brand_id: "brand-1",
    asset_type: "gif",
    content_type: "image/gif",
    download_url: `https://s3/brand-1/${id}.gif`,
    display_name: id,
    filename: `${id}.gif`,
    gif_kind: gifKind,
    metadata: {},
    ...extra,
  } as unknown as BrandAsset;
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderWithDetailPageHost(
    <QueryClientProvider client={client}>
      <DetailPageBrandGifsPanel store={{ pages: [] }} />
    </QueryClientProvider>,
    { brand: BRAND },
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("groupBrandGifs", () => {
  it("구획 순서를 고정한다(텍스트 → 이펙트 → 프롬프트 → 도형)", () => {
    const sections = groupBrandGifs([
      gif("d", "shape"),
      gif("b", "image_effect"),
      gif("a", "text"),
      gif("c", "image_prompt"),
    ]);

    expect(sections.map((s) => s.kind)).toEqual([
      "text",
      "image_effect",
      "image_prompt",
      "shape",
    ]);
  });

  it("빈 구획은 내보내지 않는다(제목만 네 줄 뜨면 고장으로 보인다)", () => {
    const sections = groupBrandGifs([gif("a", "text")]);

    expect(sections).toHaveLength(1);
    expect(sections[0].items).toHaveLength(1);
  });

  it("분류되지 않은 GIF는 '기타'로 모은다(빼면 올린 GIF가 사라진다)", () => {
    const sections = groupBrandGifs([gif("a", "text"), gif("z", null)]);

    expect(sections.map((s) => s.kind)).toEqual(["text", "other"]);
    expect(sections[1].items[0].id).toBe("z");
  });

  it("'기타'는 항상 마지막이다", () => {
    const sections = groupBrandGifs([gif("z", null), gif("d", "shape")]);

    expect(sections.map((s) => s.kind)).toEqual(["shape", "other"]);
  });
});

describe("DetailPageBrandGifsPanel", () => {
  it("GIF만 달라고 요청한다", async () => {
    mockList.mockResolvedValue([gif("a", "text")]);

    renderPanel();

    await screen.findAllByRole("img");
    expect(mockList).toHaveBeenCalledWith(
      "brand-1",
      expect.any(AbortSignal),
      "gif",
    );
  });

  it("구획 제목과 개수를 함께 보여준다", async () => {
    mockList.mockResolvedValue([
      gif("a", "text"),
      gif("b", "image_effect"),
      gif("c", "image_effect"),
    ]);

    renderPanel();

    const effect = await screen.findByText(
      "detailPage.brandGifs.sectionImageEffect",
    );
    expect(within(effect).getByText("2")).toBeTruthy();
  });

  it("클릭하면 애니메이션 플래그와 함께 캔버스에 삽입한다", async () => {
    mockList.mockResolvedValue([gif("a", "text")]);
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /a\.gif|^a$/ }));

    expect(mockInsert).toHaveBeenCalledWith(
      { pages: [] },
      "https://s3/brand-1/a.gif",
      { isGif: true },
    );
  });

  it("이펙트 이름을 배지로 보여준다(썸네일만으론 구분이 안 된다)", async () => {
    mockList.mockResolvedValue([
      gif("a", "image_effect", { metadata: { effect: "wipe_reveal" } }),
    ]);

    renderPanel();

    expect(await screen.findByText("wipe_reveal")).toBeTruthy();
  });

  it("GIF가 하나도 없으면 안내를 띄운다", async () => {
    mockList.mockResolvedValue([]);

    renderPanel();

    expect(await screen.findByText("detailPage.brandGifs.empty")).toBeTruthy();
  });
});
