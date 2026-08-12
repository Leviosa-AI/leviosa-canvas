/**
 * 스펙을 렌더 가능한 모양으로 맞춘다.
 *
 * **원본 ``spec.data``는 절대 자르지 않는다.** 종류를 ``grid`` → ``keyvalue``로 바꿨다가
 * 되돌리면 3열이 그대로 돌아와야 한다. 줄어드는 건 그리는 부분뿐이다(차트와 같은 규칙).
 */

import type { CellAlign, TableSpec } from "./types";

/** 붙여넣기·프롬프트 편집이 함께 지키는 상한. 넘으면 편집기가 아니라 스프레드시트 일이다. */
export const MAX_ROWS = 40;
export const MAX_COLUMNS = 8;

/** ``keyvalue``는 이름/값 두 칸이다. */
const KEYVALUE_COLUMNS = 2;

export type ResolvedTable = {
  /** 실제로 그릴 열 수. */
  columnCount: number;
  /** 머리글 행을 그리는가. */
  showHeader: boolean;
  /** 머리글 칸 글자(그릴 때만). */
  header: string[];
  /** 열 수에 맞춰 채우고 자른 행들(**렌더용 사본**). */
  rows: string[][];
  /** 열별 정렬(열 수만큼 채워짐). */
  align: CellAlign[];
};

/** 열 인덱스의 기본 정렬. 첫 칸은 이름이라 왼쪽, 나머지도 왼쪽에서 시작한다. */
function defaultAlign(): CellAlign {
  return "left";
}

export function resolveTable(spec: TableSpec): ResolvedTable {
  const declared = spec.data.columns.length;
  const widest = spec.data.rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columnCount =
    spec.kind === "keyvalue"
      ? KEYVALUE_COLUMNS
      : Math.min(MAX_COLUMNS, Math.max(1, declared || widest || 1));

  const rows = spec.data.rows.slice(0, MAX_ROWS).map((row) => {
    const cells = row.slice(0, columnCount).map((cell) => String(cell ?? ""));
    while (cells.length < columnCount) cells.push("");
    return cells;
  });

  const align: CellAlign[] = [];
  for (let i = 0; i < columnCount; i += 1) {
    align.push(spec.options.align[i] ?? defaultAlign());
  }

  // 머리글은 grid에서만. keyvalue는 이름 칸이 이미 각 행의 머리글 노릇을 한다.
  const showHeader = spec.kind === "grid" && spec.options.headerRow;
  const header: string[] = [];
  if (showHeader) {
    for (let i = 0; i < columnCount; i += 1) {
      header.push(String(spec.data.columns[i] ?? ""));
    }
  }

  return { columnCount, showHeader, header, rows, align };
}

/**
 * 열 폭. 첫 칸만 고정폭을 가질 수 있고 나머지는 남는 폭을 똑같이 나눈다.
 *
 * 브랜드 두 곳이 첫 칸을 190px로 고정해 쓴다 — 이름 칸이 들쭉날쭉하면 값이 세로로 안 맞아
 * 표가 무너져 보인다. 값 칸까지 폭을 스펙에 담지는 않는다(글자를 고칠 때마다 사용자가
 * 폭을 다시 만져야 한다).
 */
/** 열 하나가 가질 수 있는 최소 폭. 이보다 좁으면 여백만 남아 글자가 안 보인다. */
export const MIN_COLUMN_WIDTH = 40;

/**
 * 선언된 폭을 프레임 폭에 맞춰 비례 정규화한다.
 *
 * 비율만 지키므로 표를 리사이즈해도, 프레임이 바뀌어도 사용자가 잡아 둔 배분이 남는다.
 * 최소 폭에 걸린 열은 그 값으로 고정하고 **남은 폭만** 나머지가 나눠 갖는다 — 안 그러면
 * 정규화가 최소 폭을 다시 뭉개서 좁은 열이 사라진다.
 */
export function normalizeColumnWidths(declared: number[], total: number): number[] {
  const count = declared.length;
  if (count === 0) return [];
  // 다 최소 폭을 줘도 넘치면 배분이 의미가 없다 — 균등하게 나눈다.
  if (total < MIN_COLUMN_WIDTH * count) {
    return Array.from({ length: count }, () => total / count);
  }
  const positive = declared.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = positive.reduce((a, b) => a + b, 0);
  if (sum <= 0) return Array.from({ length: count }, () => total / count);

  const scaled = positive.map((w) => (w / sum) * total);
  const pinned = scaled.map((w) => w < MIN_COLUMN_WIDTH);
  if (!pinned.some(Boolean)) return scaled;

  const fixed = pinned.reduce((acc, isPinned) => acc + (isPinned ? MIN_COLUMN_WIDTH : 0), 0);
  const rest = total - fixed;
  const restSum = scaled.reduce((acc, w, i) => acc + (pinned[i] ? 0 : w), 0);
  if (restSum <= 0) return Array.from({ length: count }, () => total / count);
  return scaled.map((w, i) => (pinned[i] ? MIN_COLUMN_WIDTH : (w / restSum) * rest));
}

export function columnWidths(spec: TableSpec, resolved: ResolvedTable): number[] {
  const total = Math.max(1, spec.frame.width);
  const { columnCount } = resolved;

  // 사용자가 잡아 둔 배분이 있으면 그게 우선이다. 열 수가 안 맞으면(종류를 바꿨을 때)
  // 조용히 자동으로 돌아간다 — 엉뚱한 열에 폭이 남는 것보다 낫다.
  const declared = spec.style.columnWidths;
  if (declared && declared.length === columnCount) {
    return normalizeColumnWidths(declared, total);
  }

  const first = spec.style.firstWidth;
  if (first === null || columnCount <= 1) {
    const even = total / columnCount;
    return Array.from({ length: columnCount }, () => even);
  }
  // 첫 칸이 표를 다 먹지 않게 막는다(값 칸이 사라지면 표가 아니다).
  const head = Math.max(40, Math.min(first, total - 60));
  const rest = (total - head) / (columnCount - 1);
  return [head, ...Array.from({ length: columnCount - 1 }, () => rest)];
}
