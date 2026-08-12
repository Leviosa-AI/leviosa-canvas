import { describe, expect, it, vi } from "vitest";

import { createTableSpec } from "../defaults";
import {
  detachTable,
  insertTable,
  readTableSpec,
  syncTableGroup,
  tableBox,
} from "../sync";
import type { ElementLike } from "../../spec-group/sync";
import type { TableSpec } from "../types";

/** Canvas 계약을 흉내내는 페이크 스토어(차트 쪽과 같은 것). */
function makeStore() {
  let seq = 0;
  const history = { startTransaction: vi.fn(), endTransaction: vi.fn() };

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
    history,
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

function kids(group: ElementLike): ElementLike[] {
  return (group.children ?? []) as ElementLike[];
}

function partOf(el: ElementLike): string {
  return String((el.custom as Record<string, unknown>).tablePart);
}

const DATA = {
  columns: ["항목", "내용"],
  rows: [
    ["용량", "50ml"],
    ["제형", "젤 크림"],
  ],
};

function spec(overrides: Partial<TableSpec> = {}): TableSpec {
  return { ...createTableSpec({ width: 600, data: DATA }), ...overrides };
}

describe("insertTable", () => {
  it("스펙을 든 그룹 하나를 페이지에 남긴다", () => {
    const store = makeStore();
    const group = insertTable(store, spec());
    expect(store.activePage.children).toHaveLength(1);
    expect(readTableSpec(group)).toMatchObject({ v: 1, kind: "keyvalue" });
  });

  it("자식은 표 부품 표시를 달고, 잠기지는 않는다", () => {
    // 잠그면 클릭이 아무것도 못 맞혀 표를 아예 고를 수 없게 된다.
    const store = makeStore();
    const group = insertTable(store, spec())!;
    expect(kids(group).length).toBeGreaterThan(0);
    for (const kid of kids(group)) {
      expect(kid.selectable).not.toBe(false);
      expect(partOf(kid)).toBeTruthy();
    }
  });

  it("그룹에는 base 좌표를 얹지 않는다", () => {
    const group = insertTable(makeStore(), spec())!;
    expect(group.x).toBeUndefined();
    expect(group.y).toBeUndefined();
  });

  it("origin을 주면 그 자리에 놓는다", () => {
    const group = insertTable(makeStore(), spec(), { origin: { x: 40, y: 60 } })!;
    const box = tableBox(group)!;
    expect(box.x).toBe(40);
    expect(box.y).toBe(60);
  });

  it("한 번의 undo로 되돌아가게 트랜잭션으로 감싼다", () => {
    const store = makeStore();
    insertTable(store, spec());
    expect(store.history.startTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("syncTableGroup", () => {
  it("살아남은 부품은 요소 id를 유지한다", () => {
    const store = makeStore();
    const group = insertTable(store, spec())!;
    const before = new Map(kids(group).map((k) => [partOf(k), k.id]));
    syncTableGroup(store, group, {
      ...spec(),
      data: { columns: ["항목", "내용"], rows: [["용량", "100ml"], ["제형", "젤 크림"]] },
    });
    for (const kid of kids(group)) {
      const previous = before.get(partOf(kid));
      if (previous) expect(kid.id).toBe(previous);
    }
  });

  it("행이 늘면 새 부품이 페이지가 아니라 그룹 안에 들어간다", () => {
    const store = makeStore();
    const group = insertTable(store, spec())!;
    syncTableGroup(store, group, {
      ...spec(),
      data: {
        columns: ["항목", "내용"],
        rows: [...DATA.rows, ["사용 시점", "아침 · 저녁"]],
      },
    });
    expect(kids(group).some((k) => partOf(k) === "cell:2:0")).toBe(true);
    expect(store.activePage.children).toHaveLength(1);
  });

  it("행이 줄면 남은 부품을 지운다", () => {
    const store = makeStore();
    const group = insertTable(store, spec())!;
    syncTableGroup(store, group, {
      ...spec(),
      data: { columns: ["항목", "내용"], rows: [["용량", "50ml"]] },
    });
    expect(kids(group).some((k) => partOf(k) === "cell:1:0")).toBe(false);
  });

  it("데이터를 고쳐도 표가 제자리에 있는다", () => {
    const store = makeStore();
    const group = insertTable(store, spec(), { origin: { x: 40, y: 60 } })!;
    syncTableGroup(store, group, {
      ...spec(),
      data: { columns: ["항목", "내용"], rows: [["용량", "50ml"]] },
    });
    const box = tableBox(group)!;
    expect(box.x).toBe(40);
    expect(box.y).toBe(60);
  });

  it("종류를 바꿔도 데이터가 남는다", () => {
    const store = makeStore();
    const group = insertTable(store, spec())!;
    const saved = syncTableGroup(store, group, { ...spec(), kind: "grid" });
    expect(saved.kind).toBe("grid");
    expect(saved.data).toEqual(DATA);
  });

  it("표가 다른 그룹 안에 있어도 갱신된다", () => {
    const store = makeStore();
    const table = insertTable(store, spec())!;
    const memo = store.activePage.addElement({ type: "text", text: "메모" });
    const outer = store.groupElements([String(table.id), String(memo.id)]);

    syncTableGroup(store, table, {
      ...spec(),
      data: {
        columns: ["항목", "내용"],
        rows: [...DATA.rows, ["사용 시점", "아침 · 저녁"]],
      },
    });

    expect(kids(table).some((k) => partOf(k) === "cell:2:0")).toBe(true);
    expect(kids(outer)).toHaveLength(2);
    expect(store.activePage.children).toHaveLength(1);
  });
});

describe("캔버스 편집 되받기", () => {
  /** 드릴인해서 칸 글자를 직접 고친 상황. */
  function editOnCanvas(group: ElementLike, part: string, text: string) {
    const cell = kids(group).find((k) => partOf(k) === part)!;
    cell.set!({ text });
  }

  it("캔버스에서 고친 글자가 다음 재생성에 살아남는다", () => {
    // 되받기가 없으면 여기서 조용히 덮인다 — 사용자 눈에는 편집이 된 것처럼 보이고
    // 한참 뒤 행 하나를 늘리는 순간 사라진다.
    const store = makeStore();
    const group = insertTable(store, spec())!;
    editOnCanvas(group, "cell:0:1", "100ml");

    const saved = syncTableGroup(store, group, {
      ...readTableSpec(group)!,
      data: {
        columns: ["항목", "내용"],
        rows: [...DATA.rows, ["사용 시점", "아침 · 저녁"]],
      },
    });

    expect(saved.data.rows[0][1]).toBe("100ml");
    const cell = kids(group).find((k) => partOf(k) === "cell:0:1")!;
    expect((cell as unknown as { text: string }).text).toBe("100ml");
  });

  it("같은 칸을 패널에서도 고쳤으면 패널 값이 이긴다", () => {
    const store = makeStore();
    const group = insertTable(store, spec())!;
    editOnCanvas(group, "cell:0:1", "100ml");

    const saved = syncTableGroup(store, group, {
      ...readTableSpec(group)!,
      data: { columns: ["항목", "내용"], rows: [["용량", "200ml"], ["제형", "젤 크림"]] },
    });

    expect(saved.data.rows[0][1]).toBe("200ml");
  });
});

describe("readTableSpec", () => {
  it("표가 아닌 것은 걸러낸다", () => {
    expect(readTableSpec(null)).toBeNull();
    expect(readTableSpec({ type: "text", custom: { table: {} } })).toBeNull();
    expect(readTableSpec({ type: "group" })).toBeNull();
    expect(readTableSpec({ type: "group", custom: { table: { v: 2 } } })).toBeNull();
    expect(
      readTableSpec({ type: "group", custom: { table: { v: 1, kind: "keyvalue" } } }),
    ).toBeNull();
    // 행이 배열의 배열이 아니면 안 받는다.
    expect(
      readTableSpec({
        type: "group",
        custom: { table: { v: 1, kind: "grid", data: { columns: [], rows: ["a"] } } },
      }),
    ).toBeNull();
  });

  it("차트 스펙을 표로 읽지 않는다", () => {
    expect(
      readTableSpec({ type: "group", custom: { chart: { v: 1, kind: "bar-h" } } }),
    ).toBeNull();
  });
});

describe("detachTable", () => {
  it("스펙과 부품 표시를 떼어 평범한 그룹으로 만든다", () => {
    const store = makeStore();
    const group = insertTable(store, spec())!;
    detachTable(group);
    expect(readTableSpec(group)).toBeNull();
    for (const kid of kids(group)) {
      expect((kid.custom as Record<string, unknown>).tablePart).toBeUndefined();
    }
  });
});
