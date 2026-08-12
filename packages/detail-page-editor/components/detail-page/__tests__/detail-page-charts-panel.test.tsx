import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DetailPageChartsPanel } from "../detail-page-charts-panel";
import { CHART_PRESETS } from "../../../lib/detail-page/chart/defaults";
import { readChartSpec } from "../../../lib/detail-page/chart/sync";

/**
 * 패널은 실제 ``insertChart``를 그대로 태운다(모킹하지 않는다). 프리셋 클릭 한 번이
 * 스토어에 어떤 모양으로 떨어지는지가 이 패널의 유일한 계약이라서.
 */
function makeStore() {
  let seq = 0;
  const attach = (node: Record<string, unknown>) => {
    node.set = (props: Record<string, unknown>) => Object.assign(node, props);
    return node;
  };
  const page = {
    computedWidth: 1000,
    computedHeight: 1400,
    children: [] as Record<string, unknown>[],
    addElement: (props: Record<string, unknown>) => {
      const el = attach({ id: `e${++seq}`, ...props });
      page.children.push(el);
      return el;
    },
  };
  return {
    activePage: page,
    pages: [page],
    groupElements: (ids: string[], attrs: Record<string, unknown> = {}) => {
      const picked = page.children.filter((el) => ids.includes(String(el.id)));
      page.children = page.children.filter((el) => !ids.includes(String(el.id)));
      const group = attach({
        id: `g${++seq}`,
        type: "group",
        children: picked,
        ...attrs,
      });
      page.children.push(group);
      return group;
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("DetailPageChartsPanel", () => {
  it("프리셋을 전부 썸네일과 함께 보여준다", () => {
    render(<DetailPageChartsPanel store={makeStore()} />);
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(CHART_PRESETS.length);
    // 썸네일은 별도 자산이 아니라 렌더러 출력을 그대로 옮긴 SVG다.
    expect(images[0].getAttribute("src")).toContain("data:image/svg+xml");
  });

  it("프리셋을 누르면 스펙을 든 차트 그룹이 하나 생긴다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    render(<DetailPageChartsPanel store={store} />);

    await user.click(screen.getByRole("button", { name: /barHCompare/ }));

    expect(store.activePage.children).toHaveLength(1);
    const spec = readChartSpec(store.activePage.children[0]);
    expect(spec).toMatchObject({ v: 1, kind: "bar-h" });
    // 페이지 폭의 80%로 들어간다.
    expect(spec!.frame.width).toBe(800);
  });

  it("문서에서 가장 많이 쓰인 폰트를 물려받는다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.activePage.addElement({ type: "text", fontFamily: "WantedSans" });
    store.activePage.addElement({ type: "text", fontFamily: "WantedSans" });
    render(<DetailPageChartsPanel store={store} />);

    await user.click(screen.getByRole("button", { name: /barHCompare/ }));

    const group = store.activePage.children.find((el) => el.type === "group");
    expect(readChartSpec(group)!.style.fontFamily).toBe("WantedSans");
  });
});
