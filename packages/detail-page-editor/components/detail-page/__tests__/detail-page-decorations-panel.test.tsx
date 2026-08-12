import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockList = vi.fn();
const mockInsert = vi.fn();

vi.mock("../../../lib/detail-page/insert-shape", () => ({
  insertShape: (...args: unknown[]) => mockInsert(...args),
}));

import { DetailPageDecorationsPanel } from "../detail-page-decorations-panel";
import { renderWithDetailPageHost } from "./host-stub";

function item(id: string, category: string) {
  return {
    id,
    category,
    view_box: "0 0 100 100",
    width: 100,
    height: 100,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#D4AF37"/><!--${id}--></svg>`,
  };
}

const BADGE = item("trace_gold", "badge");
const LINE = item("trace_rule", "line");
const ICON = item("lib_check", "icon");

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel(client: QueryClient) {
  return renderWithDetailPageHost(
    <QueryClientProvider client={client}>
      <DetailPageDecorationsPanel store={{ pages: [] }} />
    </QueryClientProvider>,
    { api: { listDetailPageShapeLibrary: (...args) => mockList(...args) } },
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("DetailPageDecorationsPanel", () => {
  it("배지와 선만 그린다 — 아이콘 갈래는 아이콘 그룹이 덮는다", async () => {
    mockList.mockResolvedValue([BADGE, ICON, LINE]);

    renderPanel(newClient());

    const images = await screen.findAllByRole("img");
    expect(images).toHaveLength(2);
  });

  it("클릭하면 원본 SVG 마크업으로 삽입한다", async () => {
    mockList.mockResolvedValue([BADGE]);

    renderPanel(newClient());

    // 썸네일은 data URI로 인코딩해 그리되, 삽입은 원본 마크업이어야 한다.
    expect(await screen.findByRole("img")).toHaveAttribute(
      "src",
      expect.stringContaining("data:image/svg+xml"),
    );

    await userEvent.click(screen.getByRole("img").closest("button")!);

    expect(mockInsert).toHaveBeenCalledWith({ pages: [] }, BADGE.svg, BADGE.view_box);
  });

  it("패널을 닫았다 다시 열어도 카탈로그를 다시 받지 않는다", async () => {
    // 그룹을 옮길 때마다 언마운트되는 패널이라, 지역 상태로 들고 있으면 열 때마다
    // 1.7MB를 다시 받는다. 캐시가 그걸 막는지 확인한다.
    mockList.mockResolvedValue([BADGE]);
    const client = newClient();

    const first = renderPanel(client);
    await screen.findByRole("img");
    first.unmount();

    renderPanel(client);
    await screen.findByRole("img");

    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it("카탈로그를 못 받으면 빈 격자가 아니라 실패를 말한다", async () => {
    mockList.mockRejectedValue(new Error("boom"));

    renderPanel(newClient());

    expect(await screen.findByText("detailPage.shapes.decorationsFailed")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("장식 갈래가 하나도 없으면 빈 격자를 안 그린다", async () => {
    mockList.mockResolvedValue([ICON]);

    renderPanel(newClient());

    expect(await screen.findByText("detailPage.shapes.decorationsEmpty")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
