/**
 * 스펙 → Canvas 자식 노드.
 *
 * 자식은 ``figure``(바탕·선)와 ``text``(글자)뿐이다. 표에는 곡선 기하가 없어서 ``svg``
 * 자식이 아예 없고, 따라서 **글자가 SVG 안에 갇히는 문제도 없다**(그 함정은
 * ``chart/renderers/shared.ts``에 적혀 있다).
 *
 * 그리는 순서가 곧 쌓임 순서다: 바탕 → 얼룩 → 이름 칸 바탕 → 선 → 머리글 → 글자.
 */

import {
  estimateLineCount,
  textHeight,
} from "../spec-group/text-metrics";
import type { Box, SpecNode, SpecRender } from "../spec-group/sync";

import { columnWidths, resolveTable, type ResolvedTable } from "./normalize";
import type { CellAlign, TableRule, TableSpec, TableStyle } from "./types";

/** 글자가 없어도 행이 납작해지지 않게 하는 최소 높이. */
const MIN_ROW_HEIGHT = 28;

function rect(
  key: string,
  box: Box,
  fill: string,
  extra: Record<string, unknown> = {},
): SpecNode {
  return {
    key,
    props: {
      type: "figure",
      subType: "rect",
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.max(0, Math.round(box.width)),
      height: Math.max(0, Math.round(box.height)),
      fill,
      cornerRadius: 0,
      ...extra,
    },
  };
}

function text(
  key: string,
  box: { x: number; y: number; width: number },
  value: string,
  {
    fontFamily,
    fontSize,
    fill,
    align,
    fontWeight,
    lines,
  }: {
    fontFamily: string;
    fontSize: number;
    fill: string;
    align: CellAlign;
    fontWeight: number;
    lines: number;
  },
): SpecNode {
  return {
    key,
    props: {
      type: "text",
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.max(1, Math.round(box.width)),
      height: textHeight(fontSize) * lines,
      text: value,
      fontSize,
      fontFamily,
      fontWeight: String(fontWeight),
      fill,
      align,
      lineHeight: 1.3,
      verticalAlign: "top",
    },
  };
}

/** 선 하나를 얇은 사각형으로. 선은 ``figure``라 내보내기 네 경로가 전부 그린다. */
function ruleNode(key: string, box: Box, rule: TableRule): SpecNode | null {
  if (!rule || rule.width <= 0) return null;
  return rect(key, box, rule.color);
}

type CellFont = { fontFamily: string; fontSize: number; fill: string; fontWeight: number };

/** 열 인덱스에 맞는 글자 성격. 0번 칸만 따로 꾸밀 수 있다(브랜드의 이름 칸). */
function cellFont(style: TableStyle, column: number, isFirstColumn: boolean): CellFont {
  if (isFirstColumn && column === 0) {
    return {
      fontFamily: style.firstFontFamily ?? style.fontFamily,
      fontSize: style.firstSize ?? style.fontSize,
      fill: style.firstColor,
      fontWeight: style.firstWeight,
    };
  }
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fill: style.color,
    fontWeight: 400,
  };
}

/** 한 행의 높이 — 가장 많이 접히는 칸이 정한다. */
function rowHeight(
  cells: string[],
  widths: number[],
  style: TableStyle,
  isKeyValue: boolean,
): { height: number; lines: number[] } {
  const lines = cells.map((cell, column) => {
    const font = cellFont(style, column, isKeyValue);
    const usable = Math.max(1, widths[column] - style.padX * 2);
    return estimateLineCount(cell, font.fontSize, usable);
  });
  const tallest = cells.reduce((max, _cell, column) => {
    const font = cellFont(style, column, isKeyValue);
    return Math.max(max, textHeight(font.fontSize) * lines[column]);
  }, 0);
  return {
    height: Math.max(MIN_ROW_HEIGHT, tallest + style.padY * 2),
    lines,
  };
}

/** 정렬을 고려한 글자 상자의 왼쪽 x. */
function cellX(left: number, style: TableStyle): number {
  return left + style.padX;
}

/** 한 줄(머리글이든 본문이든)이 차지하는 세로 구간과, 칸별로 접힌 줄 수. */
export type LayoutRow = { y: number; height: number; lines: number[] };

/**
 * 표를 그리기 전에 나오는 기하 — 열의 x/폭, 행의 y/높이.
 *
 * ``renderTable``이 이걸로 노드를 만들고, **캔버스 오버레이도 이걸로** 행·열 핸들을
 * 놓는다. 둘이 따로 계산하면 핸들이 행 경계에서 조금씩 어긋나는데, 그건 눈에 바로
 * 띄면서 원인은 안 보이는 종류의 어긋남이다.
 */
export type TableLayout = {
  width: number;
  height: number;
  /** 그리는 열 수만큼. ``keyvalue``면 2개다(선언된 열이 더 많아도). */
  columns: Array<{ x: number; width: number }>;
  /** 머리글 행. 안 그리면 ``null``. */
  header: LayoutRow | null;
  /** 본문 행. ``spec.data.rows``와 인덱스가 같다(상한 초과분은 빠진다). */
  rows: LayoutRow[];
  /** 본문이 시작하는 y(위 선 아래). */
  bodyTop: number;
  resolved: ResolvedTable;
};

export function tableLayout(spec: TableSpec): TableLayout {
  const resolved: ResolvedTable = resolveTable(spec);
  const style = spec.style;
  const widths = columnWidths(spec, resolved);
  const width = widths.reduce((sum, w) => sum + w, 0);
  const columns: Array<{ x: number; width: number }> = [];
  widths.reduce((x, w) => {
    columns.push({ x, width: w });
    return x + w;
  }, 0);

  const isKeyValue = spec.kind === "keyvalue";
  let y = style.topRule ? style.topRule.width : 0;
  const bodyTop = y;

  let header: LayoutRow | null = null;
  if (resolved.showHeader) {
    const { height, lines } = rowHeight(resolved.header, widths, style, false);
    header = { y, height, lines };
    y += height;
    // 머리글 아래 구분선도 자리를 차지한다 — 안 더하면 첫 본문 행이 선을 덮는다.
    if (style.rowRule) y += style.rowRule.width;
  }

  const rows: LayoutRow[] = [];
  resolved.rows.forEach((cells, index) => {
    const { height, lines } = rowHeight(cells, widths, style, isKeyValue);
    rows.push({ y, height, lines });
    y += height;
    // 마지막 행 아래에는 선을 안 긋는다(바깥 테두리와 겹쳐 두 줄로 보인다).
    if (index < resolved.rows.length - 1 && style.rowRule) y += style.rowRule.width;
  });

  return {
    width,
    height: Math.max(y, bodyTop + MIN_ROW_HEIGHT),
    columns,
    header,
    rows,
    bodyTop,
    resolved,
  };
}

export function renderTable(spec: TableSpec): SpecRender {
  const layout = tableLayout(spec);
  const { resolved, width, height, bodyTop } = layout;
  const style = spec.style;
  const offsets = layout.columns.map((c) => c.x);
  const widths = layout.columns.map((c) => c.width);

  const isKeyValue = spec.kind === "keyvalue";
  const nodes: SpecNode[] = [];
  const fills: SpecNode[] = [];
  const rules: SpecNode[] = [];
  const glyphs: SpecNode[] = [];

  // ── 머리글 ────────────────────────────────────────────────────────────────
  if (resolved.showHeader && layout.header) {
    const { y, height: rowH, lines } = layout.header;
    if (style.headerFill) {
      fills.push(rect("headerFill", { x: 0, y, width, height: rowH }, style.headerFill));
    }
    resolved.header.forEach((label, column) => {
      glyphs.push(
        text(
          `header:${column}`,
          {
            x: cellX(offsets[column], style),
            y: y + style.padY,
            width: Math.max(1, widths[column] - style.padX * 2),
          },
          label,
          {
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fill: style.headerColor,
            align: resolved.align[column],
            fontWeight: style.headerWeight,
            lines: lines[column],
          },
        ),
      );
    });
    const rule = ruleNode(
      "headerRule",
      { x: 0, y: y + rowH, width, height: style.rowRule?.width ?? 0 },
      style.rowRule,
    );
    if (rule) rules.push(rule);
  }

  // ── 본문 ─────────────────────────────────────────────────────────────────
  resolved.rows.forEach((cells, index) => {
    const { y, height: rowH, lines } = layout.rows[index];

    if (spec.options.zebra && index % 2 === 1) {
      fills.push(rect(`zebra:${index}`, { x: 0, y, width, height: rowH }, style.zebraFill));
    }
    // 이름 칸 바탕 — "배경 색상으로 텍스트·배경의 명확한 분리"(브랜드 디자이너 요구).
    if (style.firstFill && resolved.columnCount > 1) {
      fills.push(
        rect(`first:${index}`, { x: 0, y, width: widths[0], height: rowH }, style.firstFill),
      );
    }

    cells.forEach((cell, column) => {
      const font = cellFont(style, column, isKeyValue);
      const align: CellAlign =
        isKeyValue && column === 0 ? style.firstAlign : resolved.align[column];
      glyphs.push(
        text(
          `cell:${index}:${column}`,
          {
            x: cellX(offsets[column], style),
            y: y + style.padY,
            width: Math.max(1, widths[column] - style.padX * 2),
          },
          cell,
          { ...font, align, lines: lines[column] },
        ),
      );
    });

    // 마지막 행 아래에는 선을 안 긋는다(바깥 테두리와 겹쳐 두 줄로 보인다).
    if (index < resolved.rows.length - 1) {
      const rule = ruleNode(
        `rowRule:${index}`,
        { x: 0, y: y + rowH, width, height: style.rowRule?.width ?? 0 },
        style.rowRule,
      );
      if (rule) rules.push(rule);
    }
  });

  // ── 표 전체에 걸리는 것 ───────────────────────────────────────────────────
  const base: SpecNode[] = [];
  if (style.outerBorder) {
    // 테두리는 채움이 **있는** 사각형의 stroke로 그린다. 투명 채움(rgba(0,0,0,0))은
    // .ai 내보내기에서 검은 박스로 굳은 전례가 있어서 쓰지 않는다.
    base.push(
      rect(
        "base",
        { x: 0, y: 0, width, height },
        style.bodyFill ?? "#FFFFFF",
        {
          stroke: style.outerBorder.color,
          strokeWidth: style.outerBorder.width,
          cornerRadius: style.outerBorder.radius,
        },
      ),
    );
  } else if (style.bodyFill) {
    base.push(rect("base", { x: 0, y: 0, width, height }, style.bodyFill));
  }

  const topRule = ruleNode(
    "topRule",
    { x: 0, y: 0, width, height: bodyTop },
    style.topRule,
  );
  if (topRule) rules.push(topRule);

  if (style.columnRule && resolved.columnCount > 1 && style.firstWidth !== null) {
    rules.push(
      rect(
        "columnRule",
        {
          x: widths[0],
          y: bodyTop,
          width: style.columnRule.width,
          height: Math.max(0, height - bodyTop),
        },
        style.columnRule.color,
      ),
    );
  }

  nodes.push(...base, ...fills, ...rules, ...glyphs);
  return { nodes, size: { width: Math.round(width), height: Math.round(height) } };
}

/**
 * 스펙을 그대로 줄인 사본. 썸네일이 실제 결과와 같은 비율로 보이게 한다.
 *
 * 선 두께는 줄이지 않는다 — 0.3px 선은 썸네일에서 사라져서 "선이 없는 표"로 보인다.
 */
export function scaleTableStyle(spec: TableSpec, factor: number): TableSpec {
  const scale = (value: number, min: number) =>
    Math.max(min, Math.round(value * factor));
  return {
    ...spec,
    style: {
      ...spec.style,
      fontSize: scale(spec.style.fontSize, 5),
      firstSize:
        spec.style.firstSize === null ? null : scale(spec.style.firstSize, 5),
      padX: scale(spec.style.padX, 3),
      padY: scale(spec.style.padY, 2),
      firstWidth:
        spec.style.firstWidth === null ? null : scale(spec.style.firstWidth, 24),
    },
  };
}

/**
 * 사용자가 트랜스포머로 늘린 결과를 스펙에 흡수한다.
 *
 * 가로는 ``frame.width``로 그대로 받는다. 세로는 행 높이가 내용에서 나오므로 늘린 만큼
 * **칸 여백**을 키운다 — 글자 크기를 건드리면 브랜드 타이포가 흐트러진다. 여백은 상한을
 * 둬서 한 번 크게 끈 뒤 표가 텅 비어 보이는 일을 막는다.
 */
export function absorbTableResize(spec: TableSpec, actual: Box): TableSpec {
  const nextWidth = Math.max(120, Math.round(actual.width));
  const previousHeight = Math.max(1, spec.frame.height);
  const scale = actual.height / previousHeight;
  const padY =
    Number.isFinite(scale) && Math.abs(scale - 1) > 0.02
      ? Math.min(64, Math.max(4, Math.round(spec.style.padY * scale)))
      : spec.style.padY;
  if (nextWidth === spec.frame.width && padY === spec.style.padY) return spec;
  return {
    ...spec,
    frame: { ...spec.frame, width: nextWidth },
    style: { ...spec.style, padY },
  };
}
