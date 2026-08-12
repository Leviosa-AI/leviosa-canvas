import { describe, expect, it } from "vitest";

import { createTableSpec } from "../defaults";
import {
  harvestTableEdits,
  mergeCanvasCells,
  parseCellKey,
} from "../harvest";
import type { ElementLike } from "../../spec-group/sync";
import type { TableSpec } from "../types";

const DATA = {
  columns: ["항목", "값"],
  rows: [
    ["용량", "50ml"],
    ["제형", "젤"],
  ],
};

function base(overrides: Partial<TableSpec> = {}): TableSpec {
  return { ...createTableSpec({ width: 600, data: DATA }), ...overrides };
}

/** 캔버스 자식 흉내 — 부품 키를 단 ``text``들. */
function children(texts: Record<string, string>, type = "text"): ElementLike[] {
  return Object.entries(texts).map(([key, text]) => ({
    id: key,
    type,
    custom: { tablePart: key },
    text,
  })) as ElementLike[];
}

describe("parseCellKey", () => {
  it("칸과 머리글만 알아본다", () => {
    expect(parseCellKey("cell:2:1")).toEqual({ kind: "cell", row: 2, column: 1 });
    expect(parseCellKey("header:0")).toEqual({ kind: "header", column: 0 });
    expect(parseCellKey("zebra:1")).toBeNull();
    expect(parseCellKey("columnRule")).toBeNull();
  });
});

describe("mergeCanvasCells", () => {
  it("캔버스에서 고친 글자를 되받는다", () => {
    const spec = base();
    const merged = mergeCanvasCells(spec, spec, children({ "cell:0:1": "100ml" }));
    expect(merged.data.rows[0][1]).toBe("100ml");
  });

  it("패널이 같은 칸을 고쳤으면 패널이 이긴다", () => {
    // 방금 명시적으로 지시한 쪽이라서다.
    const stored = base();
    const incoming: TableSpec = {
      ...stored,
      data: { ...DATA, rows: [["용량", "200ml"], ["제형", "젤"]] },
    };
    const merged = mergeCanvasCells(stored, incoming, children({ "cell:0:1": "100ml" }));
    expect(merged.data.rows[0][1]).toBe("200ml");
  });

  it("패널이 다른 칸을 고쳤으면 둘 다 산다", () => {
    const stored = base();
    const incoming: TableSpec = {
      ...stored,
      data: { ...DATA, rows: [["용량", "50ml"], ["제형", "밤"]] },
    };
    const merged = mergeCanvasCells(stored, incoming, children({ "cell:0:1": "100ml" }));
    expect(merged.data.rows[0][1]).toBe("100ml");
    expect(merged.data.rows[1][1]).toBe("밤");
  });

  it("머리글도 되받는다", () => {
    const spec = base({ kind: "grid" });
    const merged = mergeCanvasCells(spec, spec, children({ "header:1": "수치" }));
    expect(merged.data.columns[1]).toBe("수치");
  });

  it("바탕·선 부품은 무시한다", () => {
    const spec = base();
    const kids = [
      ...children({ "cell:0:0": "용량" }),
      { id: "r", type: "figure", custom: { tablePart: "zebra:1" } },
    ] as ElementLike[];
    expect(mergeCanvasCells(spec, spec, kids)).toBe(spec);
  });

  it("바뀐 게 없으면 같은 객체를 돌려준다", () => {
    const spec = base();
    expect(mergeCanvasCells(spec, spec, children({ "cell:0:0": "용량" }))).toBe(spec);
    expect(mergeCanvasCells(spec, spec, [])).toBe(spec);
  });

  it("스펙에 없는 칸은 건드리지 않는다", () => {
    // 자식이 스펙보다 앞서 있는 순간(막 지운 행)에 인덱스로 되짚으면 엉뚱한 칸이 바뀐다.
    const spec = base();
    expect(mergeCanvasCells(spec, spec, children({ "cell:9:0": "유령" }))).toBe(spec);
  });
});

describe("harvestTableEdits", () => {
  it("패널 변경 없이 캔버스 글자만 반영한다", () => {
    const spec = base();
    const harvested = harvestTableEdits(spec, children({ "cell:1:0": "타입" }));
    expect(harvested.data.rows[1][0]).toBe("타입");
    expect(harvested.data.rows[0]).toEqual(["용량", "50ml"]);
  });
});
