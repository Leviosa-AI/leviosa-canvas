import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  ChartInspector,
  highlightAfterRemove,
} from "../chart-inspector";
import { createChartSpec } from "../../../lib/detail-page/chart/defaults";
import {
  insertChart,
  readChartSpec,
  type ElementLike,
  type StoreLike,
} from "../../../lib/detail-page/chart/sync";
import type { ChartSpec } from "../../../lib/detail-page/chart/types";

function makeStore() {
  let seq = 0;
  const attach = (node: Record<string, unknown>): ElementLike => {
    const el = node as ElementLike & Record<string, unknown>;
    el.set = (props: Record<string, unknown>) => Object.assign(el, props);
    if (Array.isArray(el.children)) {
      el.addElement = (props: Record<string, unknown>) => {
        const child = attach({ id: `e${++seq}`, ...props });
        (el.children as ElementLike[]).push(child);
        return child;
      };
    }
    return el;
  };
  const page = {
    computedWidth: 1000,
    computedHeight: 1400,
    children: [] as ElementLike[],
    addElement: (props: Record<string, unknown>) => {
      const el = attach({ id: `e${++seq}`, ...props });
      page.children.push(el);
      return el;
    },
  };
  const remove = (list: ElementLike[], ids: Set<string>) => {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const child = list[i];
      if (ids.has(String(child.id))) list.splice(i, 1);
      else if (Array.isArray(child.children)) {
        remove(child.children as ElementLike[], ids);
      }
    }
  };
  return {
    activePage: page,
    pages: [page],
    groupElements: (ids: string[], attrs: Record<string, unknown> = {}) => {
      const picked = page.children.filter((el) => ids.includes(String(el.id)));
      remove(page.children, new Set(ids));
      const group = attach({
        id: `g${++seq}`,
        type: "group",
        children: picked,
        ...attrs,
      });
      page.children.push(group);
      return group;
    },
    deleteElements: (ids: string[]) => remove(page.children, new Set(ids)),
  } satisfies StoreLike;
}

/** 실제 그룹을 하나 만들어 인스펙터에 물린다(스펙 왕복을 진짜로 태운다). */
function setup(overrides: Partial<ChartSpec> = {}) {
  const store = makeStore();
  const spec = {
    ...createChartSpec({
      width: 600,
      data: {
        labels: ["가", "나"],
        series: [{ name: "값", values: [50, 100] }],
      },
    }),
    ...overrides,
  };
  const group = insertChart(store, spec)!;

  const view = render(
    <ChartInspector store={store} el={group} spec={readChartSpec(group)!} />,
  );
  const rerender = () =>
    view.rerender(
      <ChartInspector store={store} el={group} spec={readChartSpec(group)!} />,
    );
  return { store, group, rerender };
}

/**
 * 테스트의 i18n 목은 키를 그대로 돌려준다. 그래서 행별 aria-label이 전부 같은 문자열이고,
 * 행은 DOM 순서(=표 순서)로 고른다.
 */
function labelCell(row: number): HTMLElement {
  return screen.getAllByLabelText("detailPage.chart.rowLabelAria")[row];
}

function valueCell(row: number): HTMLElement {
  return screen.getAllByLabelText("detailPage.chart.rowValueAria")[row];
}

function currentSpec(group: ElementLike): ChartSpec {
  return readChartSpec(group)!;
}

function barWidth(group: ElementLike, index: number): number {
  const bar = (group.children as ElementLike[]).find(
    (kid) =>
      (kid.custom as Record<string, unknown>).chartPart === `bar:${index}`,
  );
  return Number(bar?.width);
}

describe("ChartInspector · 데이터", () => {
  it("값을 고치면 막대 길이가 따라간다", async () => {
    const user = userEvent.setup();
    const { group, rerender } = setup();
    expect(barWidth(group, 0)).toBe(300);

    const cell = valueCell(0);
    await user.clear(cell);
    await user.type(cell, "100");
    await user.tab();
    rerender();

    expect(currentSpec(group).data.series[0].values[0]).toBe(100);
    expect(barWidth(group, 0)).toBe(600);
  });

  it("천단위 콤마가 든 값을 그대로 읽는다", async () => {
    const user = userEvent.setup();
    const { group } = setup();
    const cell = valueCell(0);
    await user.clear(cell);
    await user.type(cell, "1,234");
    await user.tab();
    expect(currentSpec(group).data.series[0].values[0]).toBe(1234);
  });

  it("행을 추가하면 부품이 그룹 안에 늘어난다", async () => {
    const user = userEvent.setup();
    const { group } = setup();
    await user.click(screen.getByRole("button", { name: /addRow/ }));
    expect(currentSpec(group).data.labels).toHaveLength(3);
    expect(
      (group.children as ElementLike[]).some(
        (kid) => (kid.custom as Record<string, unknown>).chartPart === "bar:2",
      ),
    ).toBe(true);
  });

  it("마지막 한 행은 지울 수 없다", async () => {
    const user = userEvent.setup();
    const { group } = setup({
      data: { labels: ["가"], series: [{ name: "값", values: [10] }] },
    });
    const remove = screen.getAllByRole("button", { name: /removeRow/ })[0];
    expect(remove).toBeDisabled();
    await user.click(remove);
    expect(currentSpec(group).data.labels).toHaveLength(1);
  });

  it("엑셀에서 붙여넣으면 표 전체가 갈아 끼워진다", async () => {
    const user = userEvent.setup();
    const { group } = setup();
    const cell = labelCell(0);
    cell.focus();
    await user.paste("항목\t점수\n가\t10\n나\t20\n다\t30");

    const spec = currentSpec(group);
    expect(spec.data.labels).toEqual(["가", "나", "다"]);
    expect(spec.data.series[0].values).toEqual([10, 20, 30]);
    // 행 수가 달라졌으니 강조는 풀린다.
    expect(spec.options.highlightIndex).toBeNull();
  });

  it("한 칸짜리 붙여넣기는 표로 해석하지 않는다", async () => {
    const user = userEvent.setup();
    const { group } = setup();
    const cell = labelCell(0);
    await user.clear(cell);
    await user.paste("본 제품");
    await user.tab();
    expect(currentSpec(group).data.labels).toEqual(["본 제품", "나"]);
  });
});

describe("ChartInspector · 종류와 옵션", () => {
  it("종류를 바꿔도 데이터가 남는다", async () => {
    const user = userEvent.setup();
    const { group } = setup();
    await user.click(screen.getByRole("button", { name: /kinds.bar-v/ }));
    const spec = currentSpec(group);
    expect(spec.kind).toBe("bar-v");
    expect(spec.data.series[0].values).toEqual([50, 100]);
  });

  it("현재 종류가 눌린 상태로 보인다", () => {
    setup();
    expect(
      screen.getByRole("button", { name: /kinds.bar-h/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("값 표시를 끄면 값 요소가 사라진다", async () => {
    const user = userEvent.setup();
    const { group } = setup();
    await user.click(screen.getByRole("button", { name: /showValue/ }));
    expect(currentSpec(group).options.showValue).toBe(false);
    expect(
      (group.children as ElementLike[]).some(
        (kid) =>
          String((kid.custom as Record<string, unknown>).chartPart).startsWith(
            "value:",
          ),
      ),
    ).toBe(false);
  });

  it("정렬을 켜면 항목 순서가 바뀐다", async () => {
    const user = userEvent.setup();
    const { group } = setup();
    await user.click(screen.getByRole("button", { name: /sorts.desc/ }));
    const labels = (group.children as ElementLike[])
      .filter((kid) =>
        String((kid.custom as Record<string, unknown>).chartPart).startsWith(
          "label:",
        ),
      )
      .sort((a, b) =>
        String((a.custom as Record<string, unknown>).chartPart).localeCompare(
          String((b.custom as Record<string, unknown>).chartPart),
        ),
      )
      .map((kid) => (kid as Record<string, unknown>).text);
    expect(labels).toEqual(["나", "가"]);
  });

  it("강조 항목을 고르면 그 항목만 강조색이 된다", async () => {
    const user = userEvent.setup();
    const { group } = setup();
    await user.selectOptions(screen.getByLabelText(/highlight/), "1");
    const spec = currentSpec(group);
    expect(spec.options.highlightIndex).toBe(1);
    const color = (index: number) =>
      ((group.children as ElementLike[]).find(
        (kid) =>
          (kid.custom as Record<string, unknown>).chartPart === `bar:${index}`,
      ) as Record<string, unknown> | undefined)?.fill;
    expect(color(1)).toBe(spec.style.palette[0]);
    expect(color(0)).toBe(spec.style.mutedColor);
  });

  it("종류가 못 그리는 시리즈가 있으면 알려준다", () => {
    setup({
      data: {
        labels: ["가"],
        series: [
          { name: "값", values: [1] },
          { name: "보조", values: [2] },
        ],
      },
    });
    expect(screen.getByText(/hiddenSeries/)).toBeInTheDocument();
  });
});

describe("ChartInspector · 해제", () => {
  it("차트를 풀면 스펙과 부품 표시가 사라진다", async () => {
    const user = userEvent.setup();
    const { group } = setup();
    await user.click(screen.getByRole("button", { name: /chart.detach/ }));
    expect(readChartSpec(group)).toBeNull();
    for (const kid of group.children as ElementLike[]) {
      expect((kid.custom as Record<string, unknown>).chartPart).toBeUndefined();
    }
  });
});

describe("highlightAfterRemove", () => {
  it("지운 행을 가리키고 있었으면 풀리고, 뒤에 있었으면 한 칸 당겨진다", () => {
    expect(highlightAfterRemove(1, 1)).toBeNull();
    expect(highlightAfterRemove(2, 1)).toBe(1);
    expect(highlightAfterRemove(0, 1)).toBe(0);
    expect(highlightAfterRemove(null, 1)).toBeNull();
  });
});

describe("ChartInspector · 표 머리글", () => {
  it("시리즈 이름을 열 머리글로 보여준다", () => {
    setup();
    expect(screen.getByText("값")).toBeInTheDocument();
  });
});
