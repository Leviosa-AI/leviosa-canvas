import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TableInspector } from "../table-inspector";
import { createTableSpec } from "../../../lib/detail-page/table/defaults";
import {
  alignAfterColumnRemove,
  withColumnRemoved,
  withRowAdded,
} from "../../../lib/detail-page/table/edit";
import {
  insertTable,
  readTableSpec,
  type ElementLike,
  type StoreLike,
} from "../../../lib/detail-page/table/sync";
import type { TableSpec } from "../../../lib/detail-page/table/types";

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
      const group = attach({ id: `g${++seq}`, type: "group", children: picked, ...attrs });
      page.children.push(group);
      return group;
    },
    deleteElements: (ids: string[]) => remove(page.children, new Set(ids)),
  } satisfies StoreLike;
}

/** 실제 그룹을 하나 만들어 인스펙터에 물린다(스펙 왕복을 진짜로 태운다). */
function setup(overrides: Partial<TableSpec> = {}) {
  const store = makeStore();
  const spec = {
    ...createTableSpec({
      width: 600,
      data: {
        columns: ["항목", "내용"],
        rows: [
          ["용량", "50ml"],
          ["제형", "젤 크림"],
        ],
      },
    }),
    ...overrides,
  };
  const group = insertTable(store, spec)!;
  const view = render(
    <TableInspector store={store} el={group} spec={readTableSpec(group)!} />,
  );
  const rerender = () =>
    view.rerender(
      <TableInspector store={store} el={group} spec={readTableSpec(group)!} />,
    );
  return { store, group, rerender };
}

/**
 * 테스트의 i18n 목은 키를 그대로 돌려준다. 그래서 칸별 aria-label이 전부 같은 문자열이고,
 * 칸은 DOM 순서(=표 순서)로 고른다.
 */
function cell(index: number): HTMLElement {
  return screen.getAllByLabelText("detailPage.table.cellAria")[index];
}

function current(group: ElementLike): TableSpec {
  return readTableSpec(group)!;
}

function cellText(group: ElementLike, row: number, column: number): string {
  const node = (group.children as ElementLike[]).find(
    (kid) =>
      (kid.custom as Record<string, unknown>).tablePart === `cell:${row}:${column}`,
  );
  return String((node as Record<string, unknown> | undefined)?.text ?? "");
}

describe("TableInspector · 데이터", () => {
  it("칸을 고치면 캔버스 글자가 따라간다", async () => {
    const user = userEvent.setup();
    const { group, rerender } = setup();
    expect(cellText(group, 0, 1)).toBe("50ml");

    const target = cell(1); // 0행 1열
    await user.clear(target);
    await user.type(target, "100ml");
    await user.tab();
    rerender();

    expect(current(group).data.rows[0][1]).toBe("100ml");
    expect(cellText(group, 0, 1)).toBe("100ml");
  });

  it("행을 추가하면 캔버스에도 행이 생긴다", async () => {
    const user = userEvent.setup();
    const { group, rerender } = setup();
    await user.click(screen.getByText("detailPage.table.addRow"));
    rerender();

    expect(current(group).data.rows).toHaveLength(3);
    expect(
      (group.children as ElementLike[]).some(
        (kid) => (kid.custom as Record<string, unknown>).tablePart === "cell:2:0",
      ),
    ).toBe(true);
  });

  it("행을 지우면 캔버스에서도 사라진다", async () => {
    const user = userEvent.setup();
    const { group, rerender } = setup();
    await user.click(screen.getAllByLabelText("detailPage.table.removeRow")[0]);
    rerender();

    expect(current(group).data.rows).toHaveLength(1);
    expect(cellText(group, 0, 0)).toBe("제형");
  });

  it("마지막 한 행은 못 지운다", () => {
    setup({
      data: { columns: ["항목", "내용"], rows: [["용량", "50ml"]] },
    });
    expect(screen.getAllByLabelText("detailPage.table.removeRow")[0]).toBeDisabled();
  });

  it("열 추가는 여러 열 표에서만 열린다", () => {
    setup();
    expect(screen.getByText("detailPage.table.addColumn").closest("button")).toBeDisabled();
  });
});

describe("TableInspector · 종류", () => {
  it("종류를 바꿔도 데이터가 남는다", async () => {
    const user = userEvent.setup();
    const { group, rerender } = setup();
    await user.click(screen.getByText("detailPage.table.kinds.grid"));
    rerender();

    expect(current(group).kind).toBe("grid");
    expect(current(group).data.rows[0]).toEqual(["용량", "50ml"]);
  });

  it("항목·값으로 되돌려도 숨었던 열이 살아 있다", async () => {
    const user = userEvent.setup();
    const { group, rerender } = setup({
      kind: "grid",
      data: { columns: ["a", "b", "c"], rows: [["1", "2", "3"]] },
    });
    await user.click(screen.getByText("detailPage.table.kinds.keyvalue"));
    rerender();
    expect(current(group).data.rows[0]).toEqual(["1", "2", "3"]);
  });
});

describe("TableInspector · 선", () => {
  it("세로 구분선을 켜면 캔버스에 선이 생긴다", async () => {
    const user = userEvent.setup();
    const { group, rerender } = setup();
    const has = () =>
      (group.children as ElementLike[]).some(
        (kid) => (kid.custom as Record<string, unknown>).tablePart === "columnRule",
      );
    expect(has()).toBe(false);

    await user.click(screen.getByTitle("detailPage.table.columnRule"));
    rerender();
    expect(has()).toBe(true);
  });

  it("바깥 테두리를 켜면 채움 있는 사각형의 stroke로 그린다", async () => {
    const user = userEvent.setup();
    const { group, rerender } = setup();
    await user.click(screen.getByTitle("detailPage.table.outerBorder"));
    rerender();

    const base = (group.children as ElementLike[]).find(
      (kid) => (kid.custom as Record<string, unknown>).tablePart === "base",
    ) as Record<string, unknown> | undefined;
    // 투명 채움은 .ai 내보내기에서 검은 박스가 된다 — 반드시 색이 있어야 한다.
    expect(base?.fill).toBeTruthy();
    expect(base?.strokeWidth).toBe(1);
  });
});

describe("데이터 헬퍼", () => {
  it("행 추가는 열 수를 맞춰 빈 칸을 만든다", () => {
    const data = withRowAdded({ columns: ["a", "b", "c"], rows: [["1", "2", "3"]] });
    expect(data.rows[1]).toEqual(["", "", ""]);
  });

  it("열을 지우면 정렬 설정도 같이 빠진다", () => {
    const align = alignAfterColumnRemove(["left", "center", "right"], 1);
    expect(align).toEqual(["left", "right"]);
    const data = withColumnRemoved(
      { columns: ["a", "b", "c"], rows: [["1", "2", "3"]] },
      1,
    );
    expect(data.columns).toEqual(["a", "c"]);
    expect(data.rows[0]).toEqual(["1", "3"]);
  });
});
