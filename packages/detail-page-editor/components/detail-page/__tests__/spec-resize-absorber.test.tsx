import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SpecResizeAbsorber,
  boxChanged,
  findSpecGroup,
} from "../spec-resize-absorber";
import { createChartSpec } from "../../../lib/detail-page/chart/defaults";
import { insertChart, readChartSpec } from "../../../lib/detail-page/chart/sync";
import { createTableSpec } from "../../../lib/detail-page/table/defaults";
import { insertTable, readTableSpec } from "../../../lib/detail-page/table/sync";
import type { ElementLike } from "../../../lib/detail-page/spec-group/sync";

const DATA = {
  columns: ["항목", "값"],
  rows: [
    ["용량", "50ml"],
    ["제형", "젤"],
  ],
};

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
      else if (Array.isArray(child.children)) remove(child.children as ElementLike[], ids);
    }
  };
  return {
    activePage: page,
    pages: [page],
    history: { startTransaction: vi.fn(), endTransaction: vi.fn() },
    selectedElementsIds: [] as string[],
    getElementById: (id: string): ElementLike | undefined => {
      const walk = (list: ElementLike[]): ElementLike | undefined => {
        for (const el of list) {
          if (String(el.id) === id) return el;
          const found = Array.isArray(el.children)
            ? walk(el.children as ElementLike[])
            : undefined;
          if (found) return found;
        }
        return undefined;
      };
      return walk(page.children);
    },
    groupElements: (ids: string[], attrs: Record<string, unknown> = {}) => {
      const picked = page.children.filter((el) => ids.includes(String(el.id)));
      remove(page.children, new Set(ids));
      const group = attach({ id: `g${++seq}`, type: "group", children: picked, ...attrs });
      page.children.push(group);
      return group;
    },
    deleteElements: (ids: string[]) => remove(page.children, new Set(ids)),
  };
}

/** 트랜스포머가 그룹을 가로로 늘린 모습(스톡 편집기는 자식을 통째로 스케일한다). */
function stretch(group: ElementLike, factor: number) {
  for (const kid of group.children as ElementLike[]) {
    kid.set!({ x: Number(kid.x) * factor, width: Number(kid.width) * factor });
  }
}

/**
 * ``observer()``는 ``React.memo``를 씌운다 — props가 같은 참조면 리렌더를 건너뛰고
 * 이펙트도 안 돈다. 실제 편집기에서는 mobx가 스토어 변화로 리렌더를 일으키지만, 페이크
 * 스토어는 관측 대상이 아니므로 매번 새 ``containerRef``를 넘겨 리렌더를 강제한다.
 */
function paint(store: ReturnType<typeof makeStore>) {
  return <SpecResizeAbsorber store={store} containerRef={{ current: null }} />;
}

function mount(store: ReturnType<typeof makeStore>) {
  return render(paint(store));
}

describe("boxChanged", () => {
  it("1px 이하 흔들림은 무시한다", () => {
    // 소수점 흔들림으로 재생성이 돌면 캔버스가 떤다.
    expect(boxChanged({ width: 600, height: 300 }, { width: 600.4, height: 300 })).toBe(
      false,
    );
    expect(boxChanged({ width: 600, height: 300 }, { width: 640, height: 300 })).toBe(true);
  });
});

describe("findSpecGroup", () => {
  it("표와 차트를 모두 알아본다", () => {
    const store = makeStore();
    const table = insertTable(store, createTableSpec({ width: 600, data: DATA }))!;
    expect(findSpecGroup(store, [String(table.id)])?.group).toBe(table);

    const store2 = makeStore();
    const chart = insertChart(store2, createChartSpec({ width: 600 }))!;
    expect(findSpecGroup(store2, [String(chart.id)])?.group).toBe(chart);
  });

  it("스펙 그룹이 아니면 null", () => {
    const store = makeStore();
    const memo = store.activePage.addElement({ type: "text", text: "메모" });
    expect(findSpecGroup(store, [String(memo.id)])).toBeNull();
    expect(findSpecGroup(store, [])).toBeNull();
  });
});

describe("SpecResizeAbsorber", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("표를 끈 크기를 곧바로 스펙에 흡수한다", () => {
    // 안 하면 사용자가 한참 뒤 칸 하나를 고치는 순간 표가 눈에 띄게 튄다.
    const store = makeStore();
    const base = createTableSpec({ width: 600, data: DATA });
    const group = insertTable(store, base, { origin: { x: 0, y: 0 } })!;
    store.selectedElementsIds = [String(group.id)];
    const { rerender } = mount(store);

    stretch(group, 1.5);
    rerender(paint(store));
    vi.advanceTimersByTime(300);

    expect(readTableSpec(group)!.frame.width).toBe(900);
    // 글자 크기는 안 건드린다 — 가로로 넓혔을 뿐이다.
    expect(readTableSpec(group)!.style.fontSize).toBe(base.style.fontSize);
  });

  it("차트도 같은 경로로 흡수한다", () => {
    const store = makeStore();
    const group = insertChart(store, createChartSpec({ width: 600 }), {
      origin: { x: 0, y: 0 },
    })!;
    store.selectedElementsIds = [String(group.id)];
    const { rerender } = mount(store);

    stretch(group, 1.5);
    rerender(paint(store));
    vi.advanceTimersByTime(300);

    expect(readChartSpec(group)!.frame.width).toBe(900);
  });

  it("끌기가 멈추기 전에는 다시 그리지 않는다", () => {
    const store = makeStore();
    const group = insertTable(store, createTableSpec({ width: 600, data: DATA }), {
      origin: { x: 0, y: 0 },
    })!;
    store.selectedElementsIds = [String(group.id)];
    const { rerender } = mount(store);

    stretch(group, 1.5);
    rerender(paint(store));
    vi.advanceTimersByTime(100);

    expect(readTableSpec(group)!.frame.width).toBe(600);
  });

  it("흡수한 뒤에는 재생성이 다시 돌지 않는다", () => {
    // 상자가 프레임과 영영 같아지지 않는 표(바탕도 테두리도 없는)에서 무한 루프가 났었다.
    const store = makeStore();
    const base = createTableSpec({ width: 600, data: DATA });
    const group = insertTable(
      store,
      { ...base, style: { ...base.style, outerBorder: null, bodyFill: null } },
      { origin: { x: 0, y: 0 } },
    )!;
    store.selectedElementsIds = [String(group.id)];
    const { rerender } = mount(store);

    for (let i = 0; i < 5; i += 1) {
      rerender(paint(store));
      vi.advanceTimersByTime(300);
    }

    expect(readTableSpec(group)!.frame.width).toBe(600);
  });
});
