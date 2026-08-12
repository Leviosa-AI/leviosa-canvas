/**
 * 표 데이터를 고치는 순수 함수들.
 *
 * 인스펙터(우측 패널)와 캔버스 오버레이가 **같은 함수**를 쓴다. 원래는 인스펙터 안에
 * 있었는데, 캔버스에서도 행·열을 넣고 빼게 되면서 두 벌로 갈라질 뻔했다 — 한쪽만
 * ``align``을 따라 옮기는 순간 열을 지웠을 때 뒤 열들의 정렬이 한 칸씩 밀린다.
 *
 * 두 층으로 나눠 둔다:
 * - ``with*`` — ``TableData``만 다룬다(인스펙터의 입력 칸들이 쓴다).
 * - ``insertRow``/``removeColumn`` … — 스펙 전체를 받아 ``align``·상한까지 맞춘다.
 *   캔버스 핸들은 이쪽을 쓴다. 눌렀을 때 할 일이 한 번에 끝나야 하기 때문이다.
 */

import {
  MAX_COLUMNS,
  MAX_ROWS,
  MIN_COLUMN_WIDTH,
  columnWidths,
  resolveTable,
} from "./normalize";
import type { CellAlign, TableData, TableSpec } from "./types";

/** 지금 행들이 실제로 쓰는 칸 수. 새 행을 만들 때 폭을 맞추는 기준이다. */
function widthOf(data: TableData): number {
  return Math.max(1, data.columns.length, data.rows[0]?.length ?? 0);
}

function emptyRow(width: number): string[] {
  return Array.from({ length: width }, () => "");
}

/** 범위를 벗어난 삽입 위치를 양끝으로 접는다(핸들이 경계에서 눌릴 수 있다). */
function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return length;
  return Math.min(length, Math.max(0, Math.trunc(index)));
}

// ── TableData 층 ─────────────────────────────────────────────────────────────

export function withCell(
  data: TableData,
  row: number,
  column: number,
  value: string,
): TableData {
  return {
    ...data,
    rows: data.rows.map((cells, r) =>
      r === row ? cells.map((cell, c) => (c === column ? value : cell)) : cells,
    ),
  };
}

export function withColumnName(data: TableData, column: number, name: string): TableData {
  const columns = [...data.columns];
  while (columns.length <= column) columns.push("");
  columns[column] = name;
  return { ...data, columns };
}

export function withRowAdded(data: TableData): TableData {
  return { ...data, rows: [...data.rows, emptyRow(widthOf(data))] };
}

/** ``index`` 자리에 빈 행을 끼운다. ``index === rows.length``면 맨 뒤. */
export function withRowInsertedAt(data: TableData, index: number): TableData {
  const at = clampIndex(index, data.rows.length);
  const rows = [...data.rows];
  rows.splice(at, 0, emptyRow(widthOf(data)));
  return { ...data, rows };
}

export function withRowRemoved(data: TableData, index: number): TableData {
  return { ...data, rows: data.rows.filter((_, i) => i !== index) };
}

export function withColumnAdded(data: TableData): TableData {
  return {
    columns: [...data.columns, ""],
    rows: data.rows.map((cells) => [...cells, ""]),
  };
}

/**
 * ``index`` 자리에 빈 열을 끼운다.
 *
 * 행마다 길이가 다를 수 있다(정규화는 렌더용 사본에서만 한다). 짧은 행은 삽입 위치까지
 * 채운 뒤 끼워야 값이 옆 열로 밀리지 않는다.
 */
export function withColumnInsertedAt(data: TableData, index: number): TableData {
  const at = clampIndex(index, widthOf(data));
  const columns = [...data.columns];
  while (columns.length < at) columns.push("");
  columns.splice(at, 0, "");
  return {
    columns,
    rows: data.rows.map((cells) => {
      const next = [...cells];
      while (next.length < at) next.push("");
      next.splice(at, 0, "");
      return next;
    }),
  };
}

export function withColumnRemoved(data: TableData, index: number): TableData {
  return {
    columns: data.columns.filter((_, i) => i !== index),
    rows: data.rows.map((cells) => cells.filter((_, i) => i !== index)),
  };
}

/** 열을 지우면 그 열의 정렬 설정도 같이 빠져야 뒤 열들이 밀리지 않는다. */
export function alignAfterColumnRemove(align: CellAlign[], removed: number): CellAlign[] {
  return align.filter((_, i) => i !== removed);
}

/** 열을 끼우면 정렬도 같은 자리에서 벌어져야 한다(새 열은 기본 정렬). */
export function alignAfterColumnInsert(align: CellAlign[], inserted: number): CellAlign[] {
  const at = clampIndex(inserted, align.length);
  const next = [...align];
  while (next.length < at) next.push("left");
  next.splice(at, 0, "left");
  return next;
}

// ── TableSpec 층(캔버스 핸들이 쓰는 한 방 짜리) ──────────────────────────────

/** 행을 더 넣을 수 있는가. 상한에 닿으면 핸들의 ``+``를 숨긴다. */
export function canInsertRow(spec: TableSpec): boolean {
  return spec.data.rows.length < MAX_ROWS;
}

/**
 * 열을 더 넣을 수 있는가.
 *
 * ``keyvalue``는 이름·값 두 칸으로 **그리는** 종류라 열을 늘려도 화면이 안 변한다.
 * 캔버스에서는 안 되는 걸 눌러 보게 두지 않고 아예 핸들을 감춘다.
 */
export function canInsertColumn(spec: TableSpec): boolean {
  return spec.kind === "grid" && resolveTable(spec).columnCount < MAX_COLUMNS;
}

/** 마지막 하나는 못 지운다 — 행이 0이면 표가 아니라 빈 상자가 된다. */
export function canRemoveRow(spec: TableSpec): boolean {
  return spec.data.rows.length > 1;
}

export function canRemoveColumn(spec: TableSpec): boolean {
  return spec.kind === "grid" && resolveTable(spec).columnCount > 1;
}

export function insertRow(spec: TableSpec, index: number): TableSpec {
  if (!canInsertRow(spec)) return spec;
  return { ...spec, data: withRowInsertedAt(spec.data, index) };
}

export function removeRow(spec: TableSpec, index: number): TableSpec {
  if (!canRemoveRow(spec)) return spec;
  return { ...spec, data: withRowRemoved(spec.data, index) };
}

/**
 * 열을 넣고 뺄 때 **잡아 둔 폭도 같이 움직여야** 한다.
 *
 * 안 옮기면 폭 배열의 길이가 열 수와 어긋나 통째로 무시되고(자동으로 되돌아간다),
 * 길이가 우연히 맞으면 더 나쁘다 — 엉뚱한 열이 남의 폭을 입는다.
 */
function widthsAfterInsert(widths: number[] | null, at: number): number[] | null {
  if (!widths) return null;
  const next = [...widths];
  const index = clampIndex(at, next.length);
  // 새 열은 이웃만큼 준다. 남는 폭은 정규화가 알아서 다시 나눈다.
  next.splice(index, 0, next[index] ?? next[index - 1] ?? MIN_COLUMN_WIDTH);
  return next;
}

function widthsAfterRemove(widths: number[] | null, at: number): number[] | null {
  if (!widths) return null;
  return widths.filter((_, i) => i !== at);
}

export function insertColumn(spec: TableSpec, index: number): TableSpec {
  if (!canInsertColumn(spec)) return spec;
  return {
    ...spec,
    data: withColumnInsertedAt(spec.data, index),
    options: {
      ...spec.options,
      align: alignAfterColumnInsert(spec.options.align, index),
    },
    style: {
      ...spec.style,
      columnWidths: widthsAfterInsert(spec.style.columnWidths, index),
    },
  };
}

export function removeColumn(spec: TableSpec, index: number): TableSpec {
  if (!canRemoveColumn(spec)) return spec;
  return {
    ...spec,
    data: withColumnRemoved(spec.data, index),
    options: {
      ...spec.options,
      align: alignAfterColumnRemove(spec.options.align, index),
    },
    style: {
      ...spec.style,
      columnWidths: widthsAfterRemove(spec.style.columnWidths, index),
    },
  };
}

// ── 열 폭 ────────────────────────────────────────────────────────────────────

/** 배열에서 한 칸을 빼 다른 자리에 꽂는다. */
function moveAt<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [taken] = next.splice(from, 1);
  next.splice(to, 0, taken);
  return next;
}

/**
 * 열 경계 하나를 ``deltaPx``만큼 민 스펙.
 *
 * ``boundary``는 **경계 번호**(1 = 첫 열과 둘째 열 사이). 인접한 두 열만 주고받으므로
 * 표 전체 폭은 안 변한다 — 하나를 넓히면 옆이 좁아지는, 엑셀·Canva와 같은 동작이다.
 *
 * 처음 끄는 순간 지금 화면에 보이는 자동 배치값으로 ``columnWidths``를 채운다. 그래야
 * 자동 → 수동으로 넘어갈 때 표가 안 튄다.
 */
export function resizeColumn(
  spec: TableSpec,
  boundary: number,
  deltaPx: number,
): TableSpec {
  const resolved = resolveTable(spec);
  if (boundary < 1 || boundary > resolved.columnCount - 1) return spec;

  const current = columnWidths(spec, resolved);
  const left = current[boundary - 1];
  const right = current[boundary];
  if (left === undefined || right === undefined) return spec;

  // 두 열의 합은 보존한다. 어느 쪽도 최소 폭 아래로는 못 간다.
  const pair = left + right;
  const nextLeft = Math.min(
    pair - MIN_COLUMN_WIDTH,
    Math.max(MIN_COLUMN_WIDTH, left + deltaPx),
  );
  if (Math.abs(nextLeft - left) < 0.5) return spec;

  const widths = [...current];
  widths[boundary - 1] = nextLeft;
  widths[boundary] = pair - nextLeft;
  return { ...spec, style: { ...spec.style, columnWidths: widths } };
}

/** 열 폭을 자동으로 되돌린다(첫 칸만 ``firstWidth``, 나머지 균등). */
export function autoColumnWidths(spec: TableSpec): TableSpec {
  if (spec.style.columnWidths === null) return spec;
  return { ...spec, style: { ...spec.style, columnWidths: null } };
}

// ── 순서 바꾸기 ──────────────────────────────────────────────────────────────

export function moveRow(spec: TableSpec, from: number, to: number): TableSpec {
  const count = spec.data.rows.length;
  if (from === to || from < 0 || from >= count || to < 0 || to >= count) return spec;
  return { ...spec, data: { ...spec.data, rows: moveAt(spec.data.rows, from, to) } };
}

/**
 * 열 순서를 바꾼다.
 *
 * 데이터만 옮기면 안 된다 — 정렬(``align``)과 잡아 둔 폭은 **열에 붙은 성질**이라
 * 같이 따라가야 한다. 안 그러면 수치 열을 왼쪽으로 옮겼을 때 우측정렬이 원래 자리에
 * 남는다.
 */
export function moveColumn(spec: TableSpec, from: number, to: number): TableSpec {
  const count = resolveTable(spec).columnCount;
  if (from === to || from < 0 || from >= count || to < 0 || to >= count) return spec;

  const align = [...spec.options.align];
  while (align.length < count) align.push("left");

  return {
    ...spec,
    data: {
      columns: moveAt(spec.data.columns, from, to),
      rows: spec.data.rows.map((cells) =>
        // 짧은 행은 자리를 채운 뒤 옮겨야 값이 옆 열로 새지 않는다.
        moveAt(
          cells.length < count
            ? [...cells, ...Array.from({ length: count - cells.length }, () => "")]
            : cells,
          from,
          to,
        ),
      ),
    },
    options: { ...spec.options, align: moveAt(align, from, to) },
    style: {
      ...spec.style,
      columnWidths: spec.style.columnWidths
        ? moveAt(spec.style.columnWidths, from, to)
        : null,
    },
  };
}
