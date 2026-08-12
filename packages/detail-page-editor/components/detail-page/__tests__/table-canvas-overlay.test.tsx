import { createRef } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TableCanvasOverlay,
  dropIndex,
  findTableGroup,
  nearestBoundary,
  railGeometry,
} from "../table-canvas-overlay";
import { createTableSpec } from "../../../lib/detail-page/table/defaults";
import { insertTable, readTableSpec } from "../../../lib/detail-page/table/sync";
import type { ElementLike } from "../../../lib/detail-page/spec-group/sync";
import type { TableSpec } from "../../../lib/detail-page/table/types";

// 캔버스가 없으므로 Konva 측정만 갈아 끼운다. 표 상자는 스펙 프레임과 같은 자리에 있다고
// 두고(배율 1) 레일 좌표를 검증한다.
const RECT = { left: 100, top: 50, right: 700, bottom: 350 };
vi.mock("../element-rects", () => ({
  elementClientRect: () => RECT,
}));

const DATA = {
  columns: ["항목", "값", "비고"],
  rows: [
    ["용량", "50ml", "a"],
    ["제형", "젤", "b"],
    ["향", "무향", "c"],
  ],
};

function spec(overrides: Partial<TableSpec> = {}): TableSpec {
  return { ...createTableSpec({ width: 600, data: DATA, kind: "grid" }), ...overrides };
}

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

/** 레일 버튼은 i18n 목이 키를 그대로 돌려줘 이름으로 못 가른다 — 자리 번호로 집는다. */
function rail(container: HTMLElement, attribute: string, index: number): HTMLElement {
  const found = container.querySelector(`[${attribute}="${index}"]`);
  if (!found) throw new Error(`${attribute}=${index} 버튼이 없다`);
  return found as HTMLElement;
}

/** 포인터 드래그 한 번(누르고 → 옮기고 → 뗀다). */
async function drag(
  target: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await act(async () => {
    fireEvent.pointerDown(target, { pointerId: 1, clientX: from.x, clientY: from.y });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: to.x, clientY: to.y });
    fireEvent.pointerUp(target, { pointerId: 1, clientX: to.x, clientY: to.y });
  });
}

function mount(store: ReturnType<typeof makeStore>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  host.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 900, bottom: 600, width: 900, height: 600 }) as DOMRect;
  const containerRef = createRef<HTMLElement>() as { current: HTMLElement | null };
  containerRef.current = host;
  return render(<TableCanvasOverlay store={store} containerRef={containerRef} />);
}

describe("findTableGroup", () => {
  it("표 그룹이 선택되면 찾는다", () => {
    const store = makeStore();
    const group = insertTable(store, spec())!;
    expect(findTableGroup(store, [String(group.id)])).toBe(group);
  });

  it("드릴인해서 칸 하나를 골라도 그 표를 찾는다", () => {
    // 칸을 고치는 중에 레일이 사라지면 "행 추가"를 누르러 표를 다시 골라야 한다.
    const store = makeStore();
    const group = insertTable(store, spec())!;
    const cell = (group.children as ElementLike[])[0];
    expect(findTableGroup(store, [String(cell.id)])).toBe(group);
  });

  it("표가 아닌 선택은 null", () => {
    const store = makeStore();
    insertTable(store, spec());
    const memo = store.activePage.addElement({ type: "text", text: "메모" });
    expect(findTableGroup(store, [String(memo.id)])).toBeNull();
    expect(findTableGroup(store, [])).toBeNull();
  });
});

describe("railGeometry", () => {
  it("행·열을 상자 안 비율대로 배치한다", () => {
    const geometry = railGeometry(spec(), RECT, { left: 0, top: 0 });
    expect(geometry.left).toBe(100);
    expect(geometry.top).toBe(50);
    expect(geometry.rows).toHaveLength(3);
    expect(geometry.columns).toHaveLength(3);
    // 행은 위에서 아래로 이어 붙고, 겹치지 않는다.
    for (let i = 1; i < geometry.rows.length; i += 1) {
      expect(geometry.rows[i].start).toBeGreaterThanOrEqual(
        geometry.rows[i - 1].start + geometry.rows[i - 1].size - 0.01,
      );
    }
    // 열도 마찬가지로 왼쪽부터 이어진다.
    expect(geometry.columns[0].start).toBe(100);
    expect(
      geometry.columns[2].start + geometry.columns[2].size,
    ).toBeCloseTo(RECT.right, 1);
  });

  it("삽입 자리는 행 수보다 하나 많다(맨 뒤 포함)", () => {
    const geometry = railGeometry(spec(), RECT, { left: 0, top: 0 });
    expect(geometry.rowBoundaries).toHaveLength(4);
    expect(geometry.rowBoundaries[0].index).toBe(0);
    expect(geometry.rowBoundaries[3].index).toBe(3);
  });

  it("컨테이너 기준으로 옮긴다", () => {
    const geometry = railGeometry(spec(), RECT, { left: 40, top: 10 });
    expect(geometry.left).toBe(60);
    expect(geometry.top).toBe(40);
  });
});

describe("nearestBoundary / dropIndex", () => {
  const boundaries = [
    { index: 0, at: 0 },
    { index: 1, at: 100 },
    { index: 2, at: 200 },
  ];

  it("제일 가까운 경계를 고른다", () => {
    expect(nearestBoundary(boundaries, 12)).toBe(0);
    expect(nearestBoundary(boundaries, 90)).toBe(1);
    expect(nearestBoundary(boundaries, 500)).toBe(2);
  });

  it("뒤쪽 경계에 떨어뜨리면 한 칸 당겨진다", () => {
    // moveRow의 to는 빼낸 뒤의 자리다. 이걸 빼먹으면 아래로 한 칸 옮길 때 제자리에 남는다.
    expect(dropIndex(0, 2)).toBe(1);
    expect(dropIndex(2, 0)).toBe(0);
    expect(dropIndex(1, 1)).toBe(1);
  });
});

describe("TableCanvasOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("표가 안 골라졌으면 아무것도 안 그린다", () => {
    const store = makeStore();
    insertTable(store, spec());
    const { container } = mount(store);
    expect(container.querySelector("[data-dp-table-rail]")).toBeNull();
  });

  it("행 삽입 버튼이 그 자리에 행을 끼운다", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const store = makeStore();
    const group = insertTable(store, spec())!;
    store.selectedElementsIds = [String(group.id)];
    const { container } = mount(store);

    // 0번 자리 = 첫 행 위.
    await user.click(rail(container, "data-dp-row-insert", 0));

    const saved = readTableSpec(group)!;
    expect(saved.data.rows).toHaveLength(4);
    expect(saved.data.rows[0]).toEqual(["", "", ""]);
    expect(saved.data.rows[1]).toEqual(["용량", "50ml", "a"]);
  });

  it("맨 뒤 삽입 자리가 마지막 행 아래에 있다", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const store = makeStore();
    const group = insertTable(store, spec())!;
    store.selectedElementsIds = [String(group.id)];
    const { container } = mount(store);

    await user.click(rail(container, "data-dp-row-insert", 3));

    const saved = readTableSpec(group)!;
    expect(saved.data.rows).toHaveLength(4);
    expect(saved.data.rows[3]).toEqual(["", "", ""]);
  });

  it("열 삽입은 데이터와 정렬을 함께 민다", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const store = makeStore();
    const group = insertTable(
      store,
      spec({ options: { headerRow: true, align: ["left", "right", "center"], zebra: false } }),
    )!;
    store.selectedElementsIds = [String(group.id)];
    const { container } = mount(store);

    await user.click(rail(container, "data-dp-col-insert", 1));

    const saved = readTableSpec(group)!;
    expect(saved.data.columns).toEqual(["항목", "", "값", "비고"]);
    expect(saved.options.align).toEqual(["left", "left", "right", "center"]);
  });

  it("행을 지우기 전에 캔버스에서 고친 글자를 먼저 걷는다", async () => {
    // 행을 끼우면 인덱스가 밀려서, 그 뒤로는 되받기가 같은 칸을 못 알아본다.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const store = makeStore();
    const group = insertTable(store, spec())!;
    const cell = (group.children as ElementLike[]).find(
      (k) => (k.custom as Record<string, unknown>).tablePart === "cell:2:1",
    )!;
    cell.set!({ text: "은은한 향" });
    store.selectedElementsIds = [String(group.id)];
    const { container } = mount(store);

    await user.click(rail(container, "data-dp-row-insert", 0));

    const saved = readTableSpec(group)!;
    expect(saved.data.rows[3][1]).toBe("은은한 향");
  });

  it("keyvalue 표에는 열 레일을 안 띄운다", () => {
    // 두 칸으로 그리는 종류라 열을 늘려도 화면이 안 변한다.
    const store = makeStore();
    const group = insertTable(store, createTableSpec({ width: 600, data: DATA }))!;
    store.selectedElementsIds = [String(group.id)];
    const { container } = mount(store);

    expect(container.querySelector("[data-dp-col-insert]")).toBeNull();
    expect(container.querySelector("[data-dp-row-insert]")).toBeTruthy();
  });

  it("열 경계를 끌면 인접 두 열이 폭을 주고받는다", async () => {
    const store = makeStore();
    const group = insertTable(store, spec(), { origin: { x: 0, y: 0 } })!;
    store.selectedElementsIds = [String(group.id)];
    const { container } = mount(store);

    const strip = rail(container, "data-dp-col-resize", 1);
    await drag(strip, { x: 300, y: 200 }, { x: 360, y: 200 });

    const widths = readTableSpec(group)!.style.columnWidths!;
    expect(widths).toHaveLength(3);
    expect(widths[0]).toBeGreaterThan(widths[2]);
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(600, 0);
  });

  it("끄는 동안에는 스펙을 안 고친다", async () => {
    // mousemove마다 다시 그리면 캔버스가 떨고 undo가 수십 단계로 쪼개진다.
    const store = makeStore();
    const group = insertTable(store, spec(), { origin: { x: 0, y: 0 } })!;
    store.selectedElementsIds = [String(group.id)];
    const { container } = mount(store);

    const strip = rail(container, "data-dp-col-resize", 1);
    fireEvent.pointerDown(strip, { pointerId: 1, clientX: 300, clientY: 200 });
    fireEvent.pointerMove(strip, { pointerId: 1, clientX: 360, clientY: 200 });

    expect(readTableSpec(group)!.style.columnWidths).toBeNull();
    // 안내선은 뜬다.
    expect(container.querySelector('[data-dp-drag-guide="width"]')).toBeTruthy();
  });

  it("행 레일을 끌어 순서를 바꾼다", async () => {
    const store = makeStore();
    const group = insertTable(store, spec(), { origin: { x: 0, y: 0 } })!;
    store.selectedElementsIds = [String(group.id)];
    const { container } = mount(store);

    const geometry = railGeometry(spec(), RECT, { left: 0, top: 0 });
    const grip = rail(container, "data-dp-row-grip", 0);
    // 첫 행을 맨 아래 경계로.
    await drag(
      grip,
      { x: 90, y: geometry.rows[0].start + 5 },
      { x: 90, y: geometry.rowBoundaries[3].at },
    );

    expect(readTableSpec(group)!.data.rows.map((r) => r[0])).toEqual([
      "제형",
      "향",
      "용량",
    ]);
  });

  it("잡기만 하고 안 옮기면 순서가 그대로다", async () => {
    const store = makeStore();
    const group = insertTable(store, spec(), { origin: { x: 0, y: 0 } })!;
    store.selectedElementsIds = [String(group.id)];
    const { container } = mount(store);

    const grip = rail(container, "data-dp-row-grip", 0);
    await drag(grip, { x: 90, y: 60 }, { x: 91, y: 61 });

    expect(readTableSpec(group)!.data.rows.map((r) => r[0])).toEqual([
      "용량",
      "제형",
      "향",
    ]);
  });

  it("열 레일을 끌면 정렬도 같이 따라간다", async () => {
    const store = makeStore();
    const base = spec({
      options: { headerRow: true, align: ["left", "right", "center"], zebra: false },
    });
    const group = insertTable(store, base, { origin: { x: 0, y: 0 } })!;
    store.selectedElementsIds = [String(group.id)];
    const { container } = mount(store);

    const geometry = railGeometry(base, RECT, { left: 0, top: 0 });
    const grip = rail(container, "data-dp-col-grip", 2);
    await drag(
      grip,
      { x: geometry.columns[2].start + 5, y: 40 },
      { x: geometry.columnBoundaries[0].at, y: 40 },
    );

    const saved = readTableSpec(group)!;
    expect(saved.data.columns).toEqual(["비고", "항목", "값"]);
    expect(saved.options.align).toEqual(["center", "left", "right"]);
  });

  it("선택된 표가 있어도 무한 리렌더에 빠지지 않는다", () => {
    // selectedElementsDeep이 매 렌더 새 배열을 만든다 — 의존성에 두면 이펙트가 매 렌더
    // 돌고 setState가 다시 렌더를 부른다(편집기 캔버스가 통째로 죽는다).
    const store = makeStore();
    const group = insertTable(store, spec())!;
    store.selectedElementsIds = [String(group.id)];
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args[0]);
    });
    expect(() => mount(store)).not.toThrow();
    spy.mockRestore();
    expect(
      errors.filter((e) => String(e).includes("Maximum update depth")),
    ).toHaveLength(0);
  });
});
