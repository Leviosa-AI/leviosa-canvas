/**
 * 붙여넣은 텍스트를 표 데이터로.
 *
 * 표는 값을 숫자로 읽을 필요가 없다 — 칸에 들어간 글자를 그대로 쓴다("18mm · 310g",
 * "사철 양장 · 180° 평면 펼침" 같은 값이 실제로 많다).
 *
 * 머리글 판정은 차트와 같은 규칙이다: 첫 행의 값 칸에서 숫자를 하나도 못 읽으면 머리글.
 * 스펙표처럼 첫 행부터 데이터인 경우가 흔해서, 머리글이 아니라고 보면 **행을 안 버린다**.
 */

import { parseGrid } from "../spec-group/clipboard";
import { parseChartNumber } from "../chart/format";

import { MAX_COLUMNS, MAX_ROWS } from "./normalize";
import type { TableData } from "./types";

export function parseTableGrid(text: string): TableData | null {
  const grid = parseGrid(text ?? "");
  if (grid.length === 0) return null;

  const columnCount = Math.min(
    MAX_COLUMNS,
    grid.reduce((most, row) => Math.max(most, row.length), 0),
  );
  if (columnCount === 0) return null;

  const pad = (row: string[]): string[] => {
    const cells = row.slice(0, columnCount);
    while (cells.length < columnCount) cells.push("");
    return cells;
  };

  const head = pad(grid[0]);
  // 값 칸(1열 이후)에 숫자가 하나도 없고 아래에 행이 더 있으면 머리글로 본다.
  const headLooksLikeHeader =
    grid.length > 1 &&
    head.slice(1).every((cell) => cell === "" || parseChartNumber(cell) === null);

  const body = (headLooksLikeHeader ? grid.slice(1) : grid)
    .slice(0, MAX_ROWS)
    .map(pad);
  if (body.length === 0) return null;

  const columns = headLooksLikeHeader
    ? head
    : Array.from({ length: columnCount }, (_, i) => (i === 0 ? "항목" : `값 ${i}`));

  return { columns, rows: body };
}
