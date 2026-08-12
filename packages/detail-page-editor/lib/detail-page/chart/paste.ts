/**
 * 엑셀·구글시트에서 **붙여넣기**.
 *
 * 클립보드의 ``text/plain``은 스프레드시트에서 탭 구분 텍스트로 온다. Canva·미리캔버스가
 * 하는 것도 이거고, 파일 업로드보다 압도적으로 자주 쓰인다. CSV(쉼표)·세미콜론도 같이
 * 받아 준다.
 *
 * 첫 행이 머리글인지(값이 하나도 안 읽히는 행인지)로 판단해 시리즈 이름으로 쓴다.
 * 첫 열은 항상 항목 라벨이다.
 */

// 쪼개는 규칙은 표와 한 벌이다(``spec-group/clipboard``).
import {
  cellsOf,
  pickDelimiter,
  splitLines,
} from "../spec-group/clipboard";

import { parseChartNumber } from "./format";
import type { ChartData } from "./types";

/** 붙여넣기로 받아 줄 최대 크기. 넘으면 잘라낸다(차트로 읽을 수 있는 범위를 넘어선다). */
export const MAX_PASTE_ROWS = 24;
export const MAX_PASTE_SERIES = 6;

/**
 * 붙여넣은 텍스트를 차트 데이터로. 읽을 게 없으면 ``null``.
 *
 * 한 열짜리 숫자 목록도 받는다(라벨은 1,2,3…으로 채운다) — 값만 복사해 오는 경우가
 * 생각보다 흔하다.
 */
export function parseChartTable(text: string): ChartData | null {
  const lines = splitLines(text ?? "");
  if (lines.length === 0) return null;

  const delimiter = pickDelimiter(lines);
  const rows = lines.map((line) => cellsOf(line, delimiter));
  const columns = Math.min(
    MAX_PASTE_SERIES + 1,
    rows.reduce((most, row) => Math.max(most, row.length), 0),
  );
  if (columns === 0) return null;

  // 한 열짜리: 전부 숫자면 값 목록, 아니면 라벨 목록.
  if (columns === 1) {
    const first = rows.slice(0, MAX_PASTE_ROWS).map((row) => row[0] ?? "");
    const numbers = first.map(parseChartNumber);
    const allNumeric = numbers.every((n) => n !== null);
    if (allNumeric) {
      return {
        labels: first.map((_, i) => String(i + 1)),
        series: [{ name: "값", values: numbers }],
      };
    }
    return {
      labels: first,
      series: [{ name: "값", values: first.map(() => null) }],
    };
  }

  // 머리글 판정: 첫 행의 값 칸(1열 이후)에서 숫자를 하나도 못 읽으면 머리글이다.
  const head = rows[0];
  const headHasNumber = head
    .slice(1, columns)
    .some((cell) => parseChartNumber(cell) !== null);
  const names = headHasNumber
    ? Array.from({ length: columns - 1 }, (_, i) => `값 ${i + 1}`)
    : Array.from(
        { length: columns - 1 },
        (_, i) => head[i + 1] || `값 ${i + 1}`,
      );
  const body = (headHasNumber ? rows : rows.slice(1)).slice(0, MAX_PASTE_ROWS);
  if (body.length === 0) return null;

  return {
    labels: body.map((row) => row[0] ?? ""),
    series: names.map((name, column) => ({
      name,
      values: body.map((row) => parseChartNumber(row[column + 1])),
    })),
  };
}
