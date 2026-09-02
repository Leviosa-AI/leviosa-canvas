import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockList = vi.fn();
const mockSave = vi.fn();


import { DetailPageReferencesPanel } from "../detail-page-references-panel";
import { renderWithDetailPageHost } from "./host-stub";

function item(overrides: Record<string, unknown>) {
  return {
    asset_id: "a1",
    url: "https://s3/a1.png",
    stable_path: "/api/v1/brands/assets/file/a1?sig=x",
    display_name: "여름 캠페인 · 1",
    mime: "image/png",
    created_at: "2026-08-10T00:00:00",
    role: "screen",
    reference_group: "gen-1",
    reference_name: "여름 캠페인",
    generated_id: "gen-1",
    template_id: "tpl-1",
    screen_label: "brand-open",
    screen_index: 0,
    screen_count: 2,
    ...overrides,
  };
}

function renderPanel(generatedId?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderWithDetailPageHost(
    <QueryClientProvider client={client}>
      <DetailPageReferencesPanel generatedId={generatedId} />
    </QueryClientProvider>,
    {
      api: {
        listDetailPageBrandReferences: (...args) => mockList(...args),
        saveDetailPageAsBrandReference: (...args) => mockSave(...args),
      },
      brand: {
        useBrandWorkspace: () => ({
          brands: [{ id: "brand-1", name: "levi&osa", ownedCompanyId: "company-1", revision: 1 }],
          activeBrand: { id: "brand-1", name: "levi&osa", ownedCompanyId: "company-1", revision: 1 },
          activeBrandId: "brand-1",
          setActiveBrandId: vi.fn(),
          isLoading: false,
          error: null,
        }),
      },
    },
  );
}

afterEach(() => {
  mockList.mockReset();
  mockSave.mockReset();
});

describe("DetailPageReferencesPanel", () => {
  it("편집기 문서는 그림으로 걸지 않는다", async () => {
    // 같은 용도(purpose)로 저장되지만 JSON 은 그림이 아니다 — 걸면 깨진 썸네일이 된다.
    mockList.mockResolvedValue({
      items: [
        item({}),
        item({
          asset_id: "a2",
          role: "document",
          mime: "application/json",
          display_name: "여름 캠페인 · 편집기 문서",
          screen_index: 1,
        }),
      ],
      next_cursor: null,
    });

    renderPanel("gen-1");

    expect(await screen.findByAltText("여름 캠페인 · 1")).toBeInTheDocument();
    expect(screen.queryByAltText("여름 캠페인 · 편집기 문서")).toBeNull();
  });

  it("한 상세페이지에서 나온 화면을 묶어 순서대로 보여 준다", async () => {
    // 낱장으로 흩어 두면 무엇의 몇 번째 화면인지 알 수 없다.
    mockList.mockResolvedValue({
      items: [
        item({ asset_id: "b", display_name: "두 번째", screen_index: 1 }),
        item({ asset_id: "a", display_name: "첫 번째", screen_index: 0 }),
      ],
      next_cursor: null,
    });

    renderPanel("gen-1");

    await screen.findByText("여름 캠페인");
    expect(screen.getByText("detailPage.references.screenCount")).toBeInTheDocument();
    const alts = screen.getAllByRole("img").map((img) => img.getAttribute("alt"));
    expect(alts).toEqual(["첫 번째", "두 번째"]);
  });

  it("저장 버튼이 지금 문서를 브랜드에 넣는다", async () => {
    mockList.mockResolvedValue({ items: [], next_cursor: null });
    mockSave.mockResolvedValue({
      generated_id: "gen-1",
      brand_id: "brand-1",
      reference_group: "gen-1",
      display_name: "여름 캠페인",
      assets: [{ role: "screen" }, { role: "document" }],
    });

    const user = userEvent.setup();
    renderPanel("gen-1");

    await user.click(
      await screen.findByRole("button", {
        name: "detailPage.references.saveThis",
      }),
    );

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith("gen-1", { brand_id: "brand-1" }),
    );
  });

  it("아직 렌더된 화면이 없으면 이유를 그대로 보여 준다", async () => {
    // 서버는 409 로 "먼저 저장하세요"를 말한다. 그 말을 삼키면 유저는 버튼이 고장 난
    // 줄 안다.
    mockList.mockResolvedValue({ items: [], next_cursor: null });
    mockSave.mockRejectedValue(new Error("아직 저장된 화면 그림이 없습니다."));

    const user = userEvent.setup();
    renderPanel("gen-1");

    await user.click(
      await screen.findByRole("button", {
        name: "detailPage.references.saveThis",
      }),
    );

    expect(
      await screen.findByText("아직 저장된 화면 그림이 없습니다."),
    ).toBeInTheDocument();
  });

  it("인스턴스가 없으면 저장 버튼을 띄우지 않는다", async () => {
    // dev 하니스처럼 서버 문서가 없는 편집기에서는 저장할 것이 없다.
    mockList.mockResolvedValue({ items: [], next_cursor: null });

    renderPanel(undefined);

    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "detailPage.references.saveThis" }),
    ).toBeNull();
  });
});
