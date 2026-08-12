import { describe, expect, it } from "vitest";

import {
  DEFAULT_TABLE_DATA,
  TABLE_PRESETS,
  createTableSpec,
} from "../defaults";
import { absorbTableResize, renderTable } from "../render";
import { columnWidths, resolveTable } from "../normalize";
import type { TableSpec } from "../types";

function nodesOf(spec: TableSpec) {
  return renderTable(spec).nodes;
}

function keys(spec: TableSpec): string[] {
  return nodesOf(spec).map((node) => node.key);
}

function preset(id: string): TableSpec {
  const found = TABLE_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`no preset ${id}`);
  return createTableSpec({
    kind: found.kind,
    style: found.style,
    options: found.options,
    data: found.data,
  });
}

describe("renderTable", () => {
  it("자식은 figure와 text뿐이다", () => {
    // 내보내기 네 경로가 el.type을 switch하므로 모르는 타입은 조용히 사라진다.
    // 표에는 곡선 기하가 없어 svg 자식이 아예 없어야 한다(글자가 SVG에 갇히지 않는다).
    for (const p of TABLE_PRESETS) {
      const types = new Set(nodesOf(preset(p.id)).map((n) => String(n.props.type)));
      expect([...types].sort()).toEqual(["figure", "text"]);
    }
  });

  it("모든 칸이 글자 요소로 나온다", () => {
    const spec = createTableSpec({ data: DEFAULT_TABLE_DATA });
    const cellKeys = keys(spec).filter((k) => k.startsWith("cell:"));
    expect(cellKeys).toHaveLength(
      DEFAULT_TABLE_DATA.rows.length * DEFAULT_TABLE_DATA.columns.length,
    );
  });

  it("행이 겹치지 않는다", () => {
    const spec = createTableSpec({
      data: {
        columns: ["항목", "내용"],
        rows: [
          ["짧은 값", "한 줄"],
          ["긴 값", "아주 길어서 여러 줄로 접히는 값입니다. ".repeat(4)],
          ["다음", "다음 줄"],
        ],
      },
    });
    const nodes = nodesOf(spec);
    const rowTop = (index: number) =>
      Number(nodes.find((n) => n.key === `cell:${index}:0`)?.props.y ?? 0);
    // 가운데 행이 여러 줄로 접히면 그 아래 행이 그만큼 내려가야 한다.
    expect(rowTop(1)).toBeGreaterThan(rowTop(0));
    expect(rowTop(2) - rowTop(1)).toBeGreaterThan(rowTop(1) - rowTop(0));
  });

  it("마지막 행 아래에는 구분선을 안 긋는다", () => {
    // 바깥 테두리와 겹쳐 두 줄로 보인다.
    const spec = preset("spec-celled");
    const rules = keys(spec).filter((k) => k.startsWith("rowRule:"));
    const rows = spec.data.rows.length;
    expect(rules).toHaveLength(rows - 1);
  });
});

describe("브랜드 두 판", () => {
  // 이 둘이 이 설계의 증거다: 골격은 같고 스타일 값 네 개만 다르다.
  const hairline = preset("spec-hairline");
  const celled = preset("spec-celled");

  it("같은 골격을 쓴다 — 칸 글자 요소가 같다", () => {
    const cells = (spec: TableSpec) => keys(spec).filter((k) => k.startsWith("cell:"));
    expect(cells(hairline)).toEqual(cells(celled));
    expect(hairline.style.firstWidth).toBe(celled.style.firstWidth);
  });

  it("헤어라인 판은 흰 바탕만 깔고 테두리도 세로선도 없다", () => {
    const k = keys(hairline);
    // 바탕은 모든 프리셋이 흰색으로 깐다 — 없으면 어두운 섹션에서 먹빛 글씨가 사라진다.
    expect(hairline.style.bodyFill).toBe("#FFFFFF");
    expect(hairline.style.outerBorder).toBeNull();
    expect(k).not.toContain("columnRule");
    expect(k.some((key) => key.startsWith("first:"))).toBe(false);
    expect(k).toContain("topRule");
  });

  it("칸 구분 판은 이름 칸 바탕 + 세로선 + 바깥 테두리를 그린다", () => {
    const k = keys(celled);
    expect(k).toContain("base");
    expect(k).toContain("columnRule");
    expect(k.filter((key) => key.startsWith("first:"))).toHaveLength(
      celled.data.rows.length,
    );
  });

  it("바깥 테두리는 채움 있는 사각형의 stroke로 그린다", () => {
    // 투명 채움(rgba(0,0,0,0))은 .ai 내보내기에서 검은 박스로 굳은 전례가 있다.
    const base = nodesOf(celled).find((n) => n.key === "base");
    expect(base?.props.fill).toBe("#FFFFFF");
    expect(base?.props.strokeWidth).toBe(1);
    expect(base?.props.cornerRadius).toBe(4);
  });
});

describe("열 폭", () => {
  it("이름 칸은 고정폭, 나머지는 남는 폭을 나눈다", () => {
    const spec = createTableSpec({ width: 600 });
    const widths = columnWidths(spec, resolveTable(spec));
    expect(widths[0]).toBe(190);
    expect(widths[1]).toBe(410);
  });

  it("이름 칸이 표를 다 먹지 못한다", () => {
    const spec = createTableSpec({ width: 200, style: { firstWidth: 400 } });
    const widths = columnWidths(spec, resolveTable(spec));
    expect(widths[0]).toBeLessThan(200);
    expect(widths[1]).toBeGreaterThan(0);
  });

  it("고정폭이 없으면 모든 열이 같은 폭이다", () => {
    const spec = createTableSpec({
      kind: "grid",
      width: 600,
      style: { firstWidth: null },
      data: { columns: ["a", "b", "c"], rows: [["1", "2", "3"]] },
    });
    const widths = columnWidths(spec, resolveTable(spec));
    expect(widths).toEqual([200, 200, 200]);
  });
});

describe("resolveTable", () => {
  it("keyvalue는 두 칸만 그리되 원본 데이터는 안 자른다", () => {
    const spec = createTableSpec({
      kind: "keyvalue",
      data: { columns: ["a", "b", "c"], rows: [["1", "2", "3"]] },
    });
    expect(resolveTable(spec).columnCount).toBe(2);
    expect(resolveTable(spec).rows[0]).toEqual(["1", "2"]);
    // 원본은 그대로 — 종류를 되돌리면 3열이 돌아온다.
    expect(spec.data.rows[0]).toEqual(["1", "2", "3"]);
  });

  it("짧은 행은 빈 칸으로 채운다", () => {
    const spec = createTableSpec({
      kind: "grid",
      data: { columns: ["a", "b", "c"], rows: [["1"]] },
    });
    expect(resolveTable(spec).rows[0]).toEqual(["1", "", ""]);
  });

  it("머리글은 grid에서만 그린다", () => {
    const grid = createTableSpec({ kind: "grid", options: { headerRow: true } });
    const kv = createTableSpec({ kind: "keyvalue", options: { headerRow: true } });
    expect(resolveTable(grid).showHeader).toBe(true);
    expect(resolveTable(kv).showHeader).toBe(false);
  });
});

describe("absorbTableResize", () => {
  it("가로는 프레임 폭으로 받는다", () => {
    const spec = { ...createTableSpec({ width: 600 }), frame: { width: 600, height: 200 } };
    const next = absorbTableResize(spec, { x: 0, y: 0, width: 800, height: 200 });
    expect(next.frame.width).toBe(800);
  });

  it("세로는 칸 여백으로 흡수한다(글자 크기는 안 건드린다)", () => {
    const spec = { ...createTableSpec({ width: 600 }), frame: { width: 600, height: 200 } };
    const next = absorbTableResize(spec, { x: 0, y: 0, width: 600, height: 300 });
    expect(next.style.padY).toBeGreaterThan(spec.style.padY);
    expect(next.style.fontSize).toBe(spec.style.fontSize);
  });

  it("변화가 없으면 같은 스펙을 그대로 돌려준다", () => {
    const spec = { ...createTableSpec({ width: 600 }), frame: { width: 600, height: 200 } };
    expect(absorbTableResize(spec, { x: 0, y: 0, width: 600, height: 200 })).toBe(spec);
  });
});
