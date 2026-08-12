import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CanvasStoreContext } from "../canvas-observer";
import { DetailPageLayersPanel } from "../detail-page-layers-panel";
import { createChartSpec } from "../../../lib/detail-page/chart/defaults";
import { insertChart } from "../../../lib/detail-page/chart/sync";
import { insertShape } from "../../../lib/detail-page/insert-shape";
import { createCanvasStore } from "@leviosa-ai/canvas/store";

/**
 * 좌측 패널에서 넣은 것이 **레이어 목록에 뜨는가.**
 *
 * 가짜 스토어로는 안 잡히는 회귀다. 진짜 스토어가 만드는 요소에는 `selectable`·
 * `removable` 같은 플래그가 **아예 없고**(분해기가 박아 둔 요소만 갖는다), 패널이
 * 그걸 `!el.selectable`로 읽으면 새로 넣은 것만 골라서 사라진다. 그래서 여기서는
 * 진짜 스토어와 진짜 삽입 경로를 그대로 태운다.
 */

function newStore() {
  return createCanvasStore({
    width: 750,
    height: 1000,
    pages: [{ id: "p1", children: [{ id: "a", type: "figure", selectable: true }] }],
  });
}

function mount(store: ReturnType<typeof createCanvasStore>) {
  return render(
    <CanvasStoreContext.Provider value={store}>
      <DetailPageLayersPanel store={store} />
    </CanvasStoreContext.Provider>,
  );
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24"/></svg>`;

describe("레이어 패널 × 실제 삽입", () => {
  it("도형을 넣으면 그 줄이 바로 생긴다", () => {
    const store = newStore();
    mount(store);
    expect(screen.getAllByText("detailPage.layers.shape")).toHaveLength(1);

    act(() => {
      insertShape(store as never, SVG, "0 0 24 24");
    });

    expect(screen.getAllByText("detailPage.layers.shape")).toHaveLength(2);
  });

  it("차트는 이름 붙은 그룹 한 줄로 뜬다", () => {
    const store = newStore();
    mount(store);

    act(() => {
      insertChart(store as never, createChartSpec({ width: 600 }), { name: "비교 차트" });
    });

    // 부품 열두 개가 아니라 그룹 하나다.
    expect(screen.getByText("비교 차트")).toBeInTheDocument();
    expect(store.activePage?.children).toHaveLength(2);
    const group = store.activePage!.children[1];
    expect(group.type).toBe("group");
    expect(group.children.length).toBeGreaterThan(1);
  });

  it("머리글 숫자와 실제 줄 수가 어긋나지 않는다", () => {
    // 이게 어긋나 있던 것이 증상이었다 — 숫자는 8인데 줄은 여섯.
    const store = newStore();
    const view = mount(store);
    act(() => {
      insertShape(store as never, SVG, "0 0 24 24");
      insertShape(store as never, SVG, "0 0 24 24");
    });

    const count = Number(view.container.querySelector(".tabular-nums")?.textContent);
    const rows = view.container.querySelectorAll('[role="button"][draggable]');
    expect(count).toBe(3);
    expect(rows).toHaveLength(count);
  });
});
