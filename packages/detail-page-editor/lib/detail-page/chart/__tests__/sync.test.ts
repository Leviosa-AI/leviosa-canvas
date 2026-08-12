import { describe, expect, it, vi } from "vitest";

import { createChartSpec } from "../defaults";
import {
  chartBox,
  detachChart,
  documentFontFamily,
  insertChart,
  readChartSpec,
  syncChartGroup,
  type ElementLike,
} from "../sync";
import type { ChartData, ChartSpec } from "../types";

/**
 * 스톡 편집기의 계약을 흉내내는 페이크 스토어.
 *
 * 중요한 것 셋: ``page.addElement``는 페이지에, ``group.addElement``는 그룹 안에 넣고,
 * ``groupElements``는 고른 요소를 페이지에서 빼내 그룹으로 감싼다(실제 구현과 같다 —
 * ``canvas/model/store.js``).
 */
function makeStore() {
  let seq = 0;
  const history = {
    startTransaction: vi.fn(),
    endTransaction: vi.fn(),
  };

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
    history,
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
  };
}

const DATA: ChartData = {
  labels: ["가", "나"],
  series: [{ name: "값", values: [50, 100] }],
};

function spec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return { ...createChartSpec({ width: 600, data: DATA }), ...overrides };
}

function kids(group: ElementLike): ElementLike[] {
  return (group.children ?? []) as ElementLike[];
}

function partOf(el: ElementLike): string {
  return String((el.custom as Record<string, unknown>).chartPart);
}

describe("insertChart", () => {
  it("스펙을 든 그룹 하나를 페이지에 남긴다", () => {
    const store = makeStore();
    const group = insertChart(store, spec());
    expect(group).not.toBeNull();
    expect(store.activePage.children).toHaveLength(1);
    expect(readChartSpec(group)).toMatchObject({ v: 1, kind: "bar-h" });
  });

  it("자식은 차트 부품 표시를 달고, 잠기지는 않는다", () => {
    // 스톡 편집기는 자식을 맞혀야 그룹을 선택한다. selectable:false로 잠그면 클릭이
    // 아무것도 못 맞혀 차트를 아예 고를 수 없게 된다.
    const store = makeStore();
    const group = insertChart(store, spec())!;
    expect(kids(group).length).toBeGreaterThan(0);
    for (const kid of kids(group)) {
      expect(kid.selectable).not.toBe(false);
      expect(partOf(kid)).toBeTruthy();
    }
  });

  it("그룹에는 base 좌표를 얹지 않는다", () => {
    // 그룹에 x/y가 남으면 페이지 좌표를 든 자식이 이중으로 밀린다.
    const store = makeStore();
    const group = insertChart(store, spec())!;
    expect(group.x).toBeUndefined();
    expect(group.y).toBeUndefined();
  });

  it("렌더된 높이를 스펙에 되먹인다", () => {
    const store = makeStore();
    const group = insertChart(store, spec())!;
    expect(readChartSpec(group)!.frame.height).toBeGreaterThan(0);
  });

  it("origin을 주면 그 자리에, 안 주면 페이지 가운데에 놓는다", () => {
    const store = makeStore();
    const group = insertChart(store, spec(), { origin: { x: 100, y: 200 } })!;
    const box = chartBox(group)!;
    expect(box.x).toBe(100);
    expect(box.y).toBe(200);

    const centered = insertChart(makeStore(), spec())!;
    expect(chartBox(centered)!.x).toBe((1000 - 600) / 2);
  });

  it("한 번의 undo로 되돌아가게 트랜잭션으로 감싼다", () => {
    const store = makeStore();
    insertChart(store, spec());
    expect(store.history.startTransaction).toHaveBeenCalledTimes(1);
    expect(store.history.endTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("syncChartGroup", () => {
  it("살아남은 부품은 요소 id를 유지한다", () => {
    const store = makeStore();
    const group = insertChart(store, spec())!;
    const before = new Map(kids(group).map((k) => [partOf(k), k.id]));

    syncChartGroup(store, group, {
      ...spec(),
      data: { labels: ["가", "나"], series: [{ name: "값", values: [10, 20] }] },
    });

    for (const kid of kids(group)) {
      const previous = before.get(partOf(kid));
      if (previous) expect(kid.id).toBe(previous);
    }
  });

  it("행이 늘면 새 부품이 페이지가 아니라 그룹 안에 들어간다", () => {
    const store = makeStore();
    const group = insertChart(store, spec())!;
    const countBefore = kids(group).length;

    syncChartGroup(store, group, {
      ...spec(),
      data: {
        labels: ["가", "나", "다"],
        series: [{ name: "값", values: [10, 20, 30] }],
      },
    });

    expect(kids(group).length).toBeGreaterThan(countBefore);
    expect(store.activePage.children).toHaveLength(1); // 그룹 하나뿐
    expect(kids(group).some((k) => partOf(k) === "bar:2")).toBe(true);
  });

  it("행이 줄면 남은 부품을 지운다", () => {
    const store = makeStore();
    const group = insertChart(store, spec())!;
    syncChartGroup(store, group, {
      ...spec(),
      data: { labels: ["가"], series: [{ name: "값", values: [10] }] },
    });
    expect(kids(group).some((k) => partOf(k).endsWith(":1"))).toBe(false);
  });

  it("데이터를 고쳐도 차트가 제자리에 있는다", () => {
    const store = makeStore();
    const group = insertChart(store, spec(), { origin: { x: 40, y: 60 } })!;
    syncChartGroup(store, group, {
      ...spec(),
      data: { labels: ["가"], series: [{ name: "값", values: [10] }] },
    });
    const box = chartBox(group)!;
    expect(box.x).toBe(40);
    expect(box.y).toBe(60);
  });

  it("값이 바뀌면 막대 길이가 따라간다", () => {
    const store = makeStore();
    const group = insertChart(store, spec())!;
    syncChartGroup(store, group, {
      ...spec(),
      data: { labels: ["가", "나"], series: [{ name: "값", values: [100, 100] }] },
    });
    const bar = kids(group).find((k) => partOf(k) === "bar:0");
    expect(bar?.width).toBe(600);
  });

  it("종류를 바꿔도 데이터가 남는다", () => {
    const store = makeStore();
    const group = insertChart(store, spec())!;
    const saved = syncChartGroup(store, group, { ...spec(), kind: "bar-v" });
    expect(saved.kind).toBe("bar-v");
    expect(saved.data).toEqual(DATA);
    expect(readChartSpec(group)!.kind).toBe("bar-v");
  });

  it("한 번의 undo로 되돌아가게 트랜잭션으로 감싼다", () => {
    const store = makeStore();
    const group = insertChart(store, spec())!;
    store.history.startTransaction.mockClear();
    syncChartGroup(store, group, { ...spec(), kind: "bar-v" });
    expect(store.history.startTransaction).toHaveBeenCalledTimes(1);
  });

  it("차트가 다른 그룹 안에 들어가 있어도 갱신된다", () => {
    // ``layer-move``의 해체·재구성 경로는 페이지 직속 그룹만 다룰 수 있다
    // (``ungroupElements``가 자식을 페이지로 올려버려 중첩이 납작해진다).
    // 자식만 밀어 넣는 이 경로는 그 제약이 없어야 한다.
    const store = makeStore();
    const chart = insertChart(store, spec())!;
    const sticker = store.activePage.addElement({ type: "text", text: "메모" });
    const outer = store.groupElements([String(chart.id), String(sticker.id)]);
    expect(kids(outer)).toHaveLength(2);

    syncChartGroup(store, chart, {
      ...spec(),
      data: {
        labels: ["가", "나", "다"],
        series: [{ name: "값", values: [10, 20, 30] }],
      },
    });

    expect(kids(chart).some((k) => partOf(k) === "bar:2")).toBe(true);
    // 새 부품이 바깥 그룹이나 페이지로 새지 않았다.
    expect(kids(outer)).toHaveLength(2);
    expect(store.activePage.children).toHaveLength(1);
  });
});

describe("readChartSpec", () => {
  it("차트가 아닌 것은 걸러낸다", () => {
    expect(readChartSpec(null)).toBeNull();
    expect(readChartSpec({ type: "text", custom: { chart: {} } })).toBeNull();
    expect(readChartSpec({ type: "group" })).toBeNull();
    expect(readChartSpec({ type: "group", custom: { chart: { v: 2 } } })).toBeNull();
    // 골격이 깨진 스펙(데이터 배열 없음)도 안 받는다.
    expect(
      readChartSpec({ type: "group", custom: { chart: { v: 1, kind: "bar-h" } } }),
    ).toBeNull();
  });
});

describe("detachChart", () => {
  it("스펙과 부품 표시를 떼어 평범한 그룹으로 만든다", () => {
    const store = makeStore();
    const group = insertChart(store, spec())!;
    detachChart(group);
    expect(readChartSpec(group)).toBeNull();
    for (const kid of kids(group)) {
      expect((kid.custom as Record<string, unknown>).chartPart).toBeUndefined();
    }
  });
});

describe("documentFontFamily", () => {
  it("문서에서 가장 많이 쓰인 폰트를 고른다", () => {
    const store = makeStore();
    store.activePage.addElement({ type: "text", fontFamily: "Paperozi" });
    store.activePage.addElement({ type: "text", fontFamily: "WantedSans" });
    store.activePage.addElement({ type: "text", fontFamily: "WantedSans" });
    expect(documentFontFamily(store)).toBe("WantedSans");
  });

  it("텍스트가 없으면 undefined다", () => {
    expect(documentFontFamily(makeStore())).toBeUndefined();
  });
});
