import { describe, expect, it } from "vitest";

import { createTableSpec } from "../defaults";
import {
  alignAfterColumnInsert,
  alignAfterColumnRemove,
  autoColumnWidths,
  canInsertColumn,
  canInsertRow,
  canRemoveColumn,
  canRemoveRow,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  removeColumn,
  removeRow,
  resizeColumn,
  withColumnInsertedAt,
  withRowInsertedAt,
} from "../edit";
import {
  MAX_ROWS,
  MIN_COLUMN_WIDTH,
  columnWidths,
  normalizeColumnWidths,
  resolveTable,
} from "../normalize";
import type { TableSpec } from "../types";

const DATA = {
  columns: ["항목", "값", "비고"],
  rows: [
    ["용량", "50ml", "a"],
    ["제형", "젤", "b"],
  ],
};

function grid(overrides: Partial<TableSpec> = {}): TableSpec {
  return {
    ...createTableSpec({ width: 600, data: DATA, kind: "grid" }),
    ...overrides,
  };
}

describe("withRowInsertedAt", () => {
  it("가운데에 빈 행을 끼운다", () => {
    const next = withRowInsertedAt(DATA, 1);
    expect(next.rows.map((r) => r[0])).toEqual(["용량", "", "제형"]);
  });

  it("행 수와 같은 위치는 맨 뒤에 붙인다", () => {
    expect(withRowInsertedAt(DATA, 2).rows[2]).toEqual(["", "", ""]);
  });

  it("새 행의 칸 수는 기존 폭을 따른다", () => {
    expect(withRowInsertedAt(DATA, 0).rows[0]).toHaveLength(3);
  });
});

describe("withColumnInsertedAt", () => {
  it("가운데에 빈 열을 끼우면 뒤 값이 밀린다", () => {
    const next = withColumnInsertedAt(DATA, 1);
    expect(next.columns).toEqual(["항목", "", "값", "비고"]);
    expect(next.rows[0]).toEqual(["용량", "", "50ml", "a"]);
  });

  it("짧은 행도 자리를 채운 뒤 끼운다", () => {
    // 행마다 길이가 다를 수 있다(정규화는 렌더용 사본에서만 한다).
    const ragged = { columns: ["a", "b", "c"], rows: [["1"]] };
    expect(withColumnInsertedAt(ragged, 2).rows[0]).toEqual(["1", "", ""]);
  });
});

describe("align 따라가기", () => {
  it("열을 지우면 그 열의 정렬도 빠진다", () => {
    expect(alignAfterColumnRemove(["left", "center", "right"], 1)).toEqual([
      "left",
      "right",
    ]);
  });

  it("열을 끼우면 정렬도 같은 자리에서 벌어진다", () => {
    expect(alignAfterColumnInsert(["left", "right"], 1)).toEqual([
      "left",
      "left",
      "right",
    ]);
  });
});

describe("스펙 층", () => {
  it("열을 끼우면 데이터와 정렬이 함께 움직인다", () => {
    const spec = grid({
      options: { headerRow: true, align: ["left", "right", "center"], zebra: false },
    });
    const next = insertColumn(spec, 1);
    expect(next.data.columns).toEqual(["항목", "", "값", "비고"]);
    expect(next.options.align).toEqual(["left", "left", "right", "center"]);
  });

  it("열을 지우면 데이터와 정렬이 함께 빠진다", () => {
    const spec = grid({
      options: { headerRow: true, align: ["left", "right", "center"], zebra: false },
    });
    const next = removeColumn(spec, 1);
    expect(next.data.columns).toEqual(["항목", "비고"]);
    expect(next.options.align).toEqual(["left", "center"]);
  });

  it("keyvalue는 열을 늘리지 않는다", () => {
    // 두 칸으로 그리는 종류라 열을 늘려도 화면이 안 변한다 — 캔버스에서 핸들이 숨는다.
    const spec = createTableSpec({ width: 600, data: DATA });
    expect(canInsertColumn(spec)).toBe(false);
    expect(insertColumn(spec, 1)).toBe(spec);
    expect(canRemoveColumn(spec)).toBe(false);
  });

  it("마지막 행·열은 못 지운다", () => {
    const one = grid({ data: { columns: ["a"], rows: [["1"]] } });
    expect(canRemoveRow(one)).toBe(false);
    expect(removeRow(one, 0)).toBe(one);
    expect(canRemoveColumn(one)).toBe(false);
    expect(removeColumn(one, 0)).toBe(one);
  });

  it("행 상한에 닿으면 더 안 넣는다", () => {
    const full = grid({
      data: {
        columns: ["a", "b", "c"],
        rows: Array.from({ length: MAX_ROWS }, () => ["", "", ""]),
      },
    });
    expect(canInsertRow(full)).toBe(false);
    expect(insertRow(full, 0)).toBe(full);
  });

  it("바뀌지 않으면 같은 객체를 돌려준다", () => {
    // 호출부가 "달라졌는가"를 참조 비교로 싸게 판단한다.
    const spec = grid();
    expect(insertRow(spec, 1)).not.toBe(spec);
  });
});

describe("normalizeColumnWidths", () => {
  it("비율을 지키며 프레임 폭에 맞춘다", () => {
    // 비율만 지키므로 표를 리사이즈해도 사용자가 잡아 둔 배분이 남는다.
    expect(normalizeColumnWidths([100, 200, 100], 800)).toEqual([200, 400, 200]);
  });

  it("최소 폭에 걸린 열은 고정하고 남은 폭만 나눈다", () => {
    // 그냥 정규화하면 최소 폭을 다시 뭉개서 좁은 열이 사라진다.
    const widths = normalizeColumnWidths([1, 100, 100], 600);
    expect(widths[0]).toBe(MIN_COLUMN_WIDTH);
    expect(widths[1]).toBeCloseTo(280, 5);
    expect(widths[2]).toBeCloseTo(280, 5);
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(600, 5);
  });

  it("다 최소 폭을 줘도 넘치면 균등하게 나눈다", () => {
    expect(normalizeColumnWidths([10, 10, 10], 60)).toEqual([20, 20, 20]);
  });

  it("쓸 수 없는 값이면 균등 분배로 떨어진다", () => {
    expect(normalizeColumnWidths([0, 0], 400)).toEqual([200, 200]);
    expect(normalizeColumnWidths([Number.NaN, -5], 400)).toEqual([200, 200]);
  });
});

describe("columnWidths 우선순위", () => {
  it("잡아 둔 폭이 firstWidth보다 우선한다", () => {
    const spec = grid({
      frame: { width: 600, height: 300 },
      style: { ...grid().style, firstWidth: 190, columnWidths: [300, 150, 150] },
    });
    expect(columnWidths(spec, resolveTable(spec))).toEqual([300, 150, 150]);
  });

  it("열 수가 안 맞으면 조용히 자동으로 돌아간다", () => {
    // 종류를 바꿨을 때 엉뚱한 열이 남의 폭을 입는 것보다 낫다.
    const spec = grid({
      frame: { width: 600, height: 300 },
      style: { ...grid().style, firstWidth: null, columnWidths: [300, 300] },
    });
    expect(columnWidths(spec, resolveTable(spec))).toEqual([200, 200, 200]);
  });
});

describe("resizeColumn", () => {
  function sized(): TableSpec {
    return grid({
      frame: { width: 600, height: 300 },
      style: { ...grid().style, firstWidth: null, columnWidths: null },
    });
  }

  it("처음 끌면 지금 보이는 자동 배치값으로 채운다", () => {
    // 그래야 자동 → 수동으로 넘어갈 때 표가 안 튄다.
    const next = resizeColumn(sized(), 1, 40);
    expect(next.style.columnWidths).toEqual([240, 160, 200]);
  });

  it("인접 두 열만 주고받아 전체 폭이 안 변한다", () => {
    const next = resizeColumn(sized(), 2, -50);
    const widths = next.style.columnWidths!;
    expect(widths[0]).toBe(200);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(600);
  });

  it("최소 폭 아래로는 못 민다", () => {
    const next = resizeColumn(sized(), 1, 500);
    const widths = next.style.columnWidths!;
    expect(widths[1]).toBe(MIN_COLUMN_WIDTH);
    expect(widths[0] + widths[1]).toBe(400);
  });

  it("표 바깥 경계는 무시한다", () => {
    const spec = sized();
    expect(resizeColumn(spec, 0, 30)).toBe(spec);
    expect(resizeColumn(spec, 3, 30)).toBe(spec);
  });

  it("움직임이 없으면 같은 객체", () => {
    const spec = sized();
    expect(resizeColumn(spec, 1, 0.2)).toBe(spec);
  });
});

describe("autoColumnWidths", () => {
  it("잡아 둔 폭을 지운다", () => {
    const spec = grid({ style: { ...grid().style, columnWidths: [1, 2, 3] } });
    expect(autoColumnWidths(spec).style.columnWidths).toBeNull();
  });

  it("이미 자동이면 같은 객체", () => {
    const spec = grid();
    expect(autoColumnWidths(spec)).toBe(spec);
  });
});

describe("열을 넣고 뺄 때 폭이 따라간다", () => {
  it("열을 끼우면 폭도 같은 자리에서 벌어진다", () => {
    const spec = grid({ style: { ...grid().style, columnWidths: [300, 150, 150] } });
    expect(insertColumn(spec, 1).style.columnWidths).toHaveLength(4);
  });

  it("열을 지우면 그 폭도 빠진다", () => {
    // 길이가 우연히 맞으면 엉뚱한 열이 남의 폭을 입는다.
    const spec = grid({ style: { ...grid().style, columnWidths: [300, 150, 150] } });
    expect(removeColumn(spec, 0).style.columnWidths).toEqual([150, 150]);
  });

  it("자동이면 자동으로 남는다", () => {
    expect(insertColumn(grid(), 1).style.columnWidths).toBeNull();
  });
});

describe("순서 바꾸기", () => {
  it("행을 옮긴다", () => {
    const next = moveRow(grid(), 0, 1);
    expect(next.data.rows.map((r) => r[0])).toEqual(["제형", "용량"]);
  });

  it("열을 옮기면 정렬과 폭이 같이 따라간다", () => {
    // 안 따라가면 수치 열을 왼쪽으로 옮겼을 때 우측정렬이 원래 자리에 남는다.
    const spec = grid({
      options: { headerRow: true, align: ["left", "right", "center"], zebra: false },
      style: { ...grid().style, columnWidths: [300, 150, 150] },
    });
    const next = moveColumn(spec, 2, 0);
    expect(next.data.columns).toEqual(["비고", "항목", "값"]);
    expect(next.data.rows[0]).toEqual(["a", "용량", "50ml"]);
    expect(next.options.align).toEqual(["center", "left", "right"]);
    expect(next.style.columnWidths).toEqual([150, 300, 150]);
  });

  it("짧은 행도 자리를 채운 뒤 옮긴다", () => {
    const spec = grid({ data: { columns: ["a", "b", "c"], rows: [["1"]] } });
    expect(moveColumn(spec, 0, 2).data.rows[0]).toEqual(["", "", "1"]);
  });

  it("범위 밖이거나 제자리면 같은 객체", () => {
    const spec = grid();
    expect(moveRow(spec, 0, 0)).toBe(spec);
    expect(moveRow(spec, 0, 9)).toBe(spec);
    expect(moveColumn(spec, 1, 1)).toBe(spec);
    expect(moveColumn(spec, -1, 0)).toBe(spec);
  });
});
