import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 그룹 패널 셋은 이번 재편에서 한 줄도 안 바뀌었다. 여기서 검증할 것은 "고르는 자리"
// 뿐이라 내용은 가짜로 세운다 — 진짜 패널을 태우면 카탈로그 fetch·프리셋 렌더가
// 딸려 와서, 탭 전환이 깨져도 그쪽 실패에 묻힌다.
vi.mock("../detail-page-shapes-panel", () => ({
  DetailPageShapesPanel: ({ store }: { store: unknown }) => (
    <div data-store={String((store as { id?: string })?.id)}>SHAPES_PANEL</div>
  ),
}));
vi.mock("../detail-page-charts-panel", () => ({
  DetailPageChartsPanel: () => <div>CHARTS_PANEL</div>,
}));
vi.mock("../detail-page-tables-panel", () => ({
  DetailPageTablesPanel: () => <div>TABLES_PANEL</div>,
}));
vi.mock("../detail-page-icons-panel", () => ({
  DetailPageIconsPanel: () => <div>ICONS_PANEL</div>,
}));
vi.mock("../detail-page-qr-panel", () => ({
  DetailPageQrPanel: () => <div>QR_PANEL</div>,
}));
vi.mock("../detail-page-decorations-panel", () => ({
  DetailPageDecorationsPanel: () => <div>DECORATIONS_PANEL</div>,
}));
// 스트립은 저장소를 읽는다. 그룹 전환 검증에 끼어들 이유가 없다.
vi.mock("../element-recents-strip", () => ({
  ElementRecentsStrip: () => null,
}));

import type { ElementsGroupId } from "../detail-page-elements-panel";

const STORE = { id: "store-1" };

/**
 * 마지막으로 본 그룹은 모듈 전역에 산다(패널이 탭을 옮길 때마다 언마운트되므로).
 * 테스트끼리 그 기억이 새지 않게, 매번 모듈을 새로 들여온다.
 */
async function freshPanel() {
  vi.resetModules();
  const mod = await import(
    "../detail-page-elements-panel"
  );
  return mod.DetailPageElementsPanel;
}

async function renderPanel(defaultGroup?: ElementsGroupId) {
  const Panel = await freshPanel();
  const view = render(<Panel store={STORE} defaultGroup={defaultGroup} />);
  return { Panel, view };
}

const tab = (key: string) =>
  screen.getByRole("tab", { name: `detailPage.sidebar.${key}` });

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DetailPageElementsPanel", () => {
  it("도형·아이콘·QR·장식·차트·표를 한 탭 안의 그룹으로 세운다", async () => {
    await renderPanel();

    for (const key of ["shapes", "icons", "qr", "decorations", "charts", "tables"]) {
      expect(tab(key), key).toBeInTheDocument();
    }
  });

  it("장식은 도형 바로 아래 칸이다 — 3열 격자의 2행 1열", async () => {
    // 도형에서 갈라져 나온 것으로 읽히려면 같은 열에 세로로 붙어 있어야 한다.
    await renderPanel();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.indexOf(tab("decorations"))).toBe(tabs.indexOf(tab("shapes")) + 3);
  });

  it("장식 그룹도 열린 하나만 그린다", async () => {
    const user = userEvent.setup();
    await renderPanel();

    await user.click(tab("decorations"));
    expect(screen.getByText("DECORATIONS_PANEL")).toBeInTheDocument();
    expect(screen.queryByText("SHAPES_PANEL")).not.toBeInTheDocument();
  });

  it("처음에는 도형 그룹을 열고 나머지는 그리지 않는다", async () => {
    await renderPanel();

    expect(screen.getByText("SHAPES_PANEL")).toBeInTheDocument();
    expect(screen.queryByText("CHARTS_PANEL")).not.toBeInTheDocument();
    expect(screen.queryByText("TABLES_PANEL")).not.toBeInTheDocument();
    expect(screen.queryByText("ICONS_PANEL")).not.toBeInTheDocument();
    expect(screen.queryByText("QR_PANEL")).not.toBeInTheDocument();
    expect(tab("shapes")).toHaveAttribute("aria-selected", "true");
  });

  it("아이콘·QR 그룹도 열린 하나만 그린다", async () => {
    const user = userEvent.setup();
    await renderPanel();

    await user.click(tab("icons"));
    expect(screen.getByText("ICONS_PANEL")).toBeInTheDocument();
    expect(screen.queryByText("SHAPES_PANEL")).not.toBeInTheDocument();

    await user.click(tab("qr"));
    expect(screen.getByText("QR_PANEL")).toBeInTheDocument();
    expect(screen.queryByText("ICONS_PANEL")).not.toBeInTheDocument();
  });

  it("그룹을 누르면 그 패널로 갈아 끼우고 이전 것은 언마운트한다", async () => {
    const user = userEvent.setup();
    await renderPanel();

    await user.click(tab("charts"));

    expect(screen.getByText("CHARTS_PANEL")).toBeInTheDocument();
    // 안 보이게만 두면 차트 프리셋 SVG를 굽는 비용이 도형 패널 위에 그대로 쌓인다.
    expect(screen.queryByText("SHAPES_PANEL")).not.toBeInTheDocument();
    expect(tab("charts")).toHaveAttribute("aria-selected", "true");
    expect(tab("shapes")).toHaveAttribute("aria-selected", "false");
  });

  it("스토어를 그룹 패널에 그대로 넘긴다", async () => {
    await renderPanel();

    expect(screen.getByText("SHAPES_PANEL")).toHaveAttribute(
      "data-store",
      "store-1",
    );
  });

  it("탭을 떠났다 돌아와도 마지막으로 본 그룹으로 연다", async () => {
    // 탭이 셋으로 갈려 있을 때는 레일이 이 기억을 대신했다. 접은 뒤에도 남겨야
    // "표 넣다가 사진 보고 오면 도형으로 튕기는" 회귀가 안 생긴다.
    const user = userEvent.setup();
    const Panel = await freshPanel();

    const first = render(<Panel store={STORE} />);
    await user.click(tab("tables"));
    expect(screen.getByText("TABLES_PANEL")).toBeInTheDocument();
    first.unmount();

    render(<Panel store={STORE} />);
    expect(screen.getByText("TABLES_PANEL")).toBeInTheDocument();
    expect(tab("tables")).toHaveAttribute("aria-selected", "true");
  });

  it("defaultGroup을 주면 그 그룹으로 연다", async () => {
    await renderPanel("charts");

    expect(screen.getByText("CHARTS_PANEL")).toBeInTheDocument();
  });
});
