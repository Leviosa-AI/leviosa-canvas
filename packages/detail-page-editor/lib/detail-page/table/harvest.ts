/**
 * 캔버스에서 고친 칸 글자를 스펙으로 되받는다.
 *
 * 표의 칸은 평범한 ``text`` 자식이라 드릴인하면 그 자리에서 고쳐진다(Canva에서 하듯이).
 * 그런데 다시 그리는 기준은 언제나 스펙이므로, 되받지 않으면 사용자가 **다음에 행 하나
 * 늘리는 순간** 캔버스에서 친 글자가 스펙 값으로 덮인다. 눈에는 편집이 되는 것처럼
 * 보이고 한참 뒤에 사라지는, 가장 나쁜 종류의 손실이다.
 *
 * 그래서 3-way 병합을 한다. 되받기와 패널 편집이 동시에 일어날 수 있기 때문이다 —
 * 예를 들어 사용자가 캔버스에서 1행을 고치고, 우측 패널에서 2행을 고친 뒤 Enter를 치면
 * 그 한 번의 재생성에 둘 다 살아야 한다.
 *
 *   base     = 그룹에 저장돼 있던 스펙(마지막으로 그린 그림의 근거)
 *   canvas   = 지금 자식 ``text``에 들어 있는 글자
 *   incoming = 이번에 적용하려는 스펙(패널·AI 편집이 만든 것)
 *
 * 칸마다: 캔버스가 base와 다르고 **incoming은 base 그대로**면 캔버스를 택한다. 둘 다
 * 바뀌었으면 incoming이 이긴다 — 방금 명시적으로 지시한 쪽이라서다.
 */

import type { ElementLike } from "../spec-group/sync";

import { TABLE_PART, type TableSpec } from "./types";

/** ``cell:3:1`` / ``header:2`` → 어느 칸인가. 그 외 부품(바탕·선)은 ``null``. */
export function parseCellKey(
  key: string,
): { kind: "cell"; row: number; column: number } | { kind: "header"; column: number } | null {
  const cell = /^cell:(\d+):(\d+)$/.exec(key);
  if (cell) return { kind: "cell", row: Number(cell[1]), column: Number(cell[2]) };
  const header = /^header:(\d+)$/.exec(key);
  if (header) return { kind: "header", column: Number(header[1]) };
  return null;
}

/** 자식에서 (부품 키, 글자)를 뽑는다. ``text``가 아닌 부품은 글자를 들고 있지 않다. */
function readCellTexts(children: ElementLike[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const kid of children) {
    if (kid.type !== "text") continue;
    const key = (kid.custom as Record<string, unknown> | undefined)?.[TABLE_PART];
    const value = (kid as unknown as { text?: unknown }).text;
    if (typeof key === "string" && typeof value === "string") out.set(key, value);
  }
  return out;
}

/**
 * 캔버스 편집을 ``incoming``에 얹은 스펙. 바뀐 게 없으면 ``incoming``을 그대로 돌려준다
 * (참조가 같아야 호출부가 "달라졌는가"를 싸게 판단한다).
 */
export function mergeCanvasCells(
  base: TableSpec,
  incoming: TableSpec,
  children: ElementLike[],
): TableSpec {
  const texts = readCellTexts(children);
  if (texts.size === 0) return incoming;

  let rows: string[][] | null = null;
  let columns: string[] | null = null;

  for (const [key, canvas] of texts) {
    const at = parseCellKey(key);
    if (!at) continue;

    if (at.kind === "header") {
      const baseValue = base.data.columns[at.column];
      const incomingValue = incoming.data.columns[at.column];
      if (canvas === baseValue || incomingValue !== baseValue) continue;
      columns = columns ?? [...incoming.data.columns];
      columns[at.column] = canvas;
      continue;
    }

    const baseValue = base.data.rows[at.row]?.[at.column];
    const incomingValue = incoming.data.rows[at.row]?.[at.column];
    // 행이 아직 없는 자리(스펙보다 자식이 앞선 경우)는 건드리지 않는다.
    if (baseValue === undefined || incomingValue === undefined) continue;
    if (canvas === baseValue || incomingValue !== baseValue) continue;
    rows = rows ?? incoming.data.rows.map((cells) => [...cells]);
    rows[at.row][at.column] = canvas;
  }

  if (!rows && !columns) return incoming;
  return {
    ...incoming,
    data: {
      columns: columns ?? incoming.data.columns,
      rows: rows ?? incoming.data.rows,
    },
  };
}

/**
 * 캔버스 글자만 반영한 스펙(패널 쪽 변경 없이).
 *
 * 오버레이가 행·열을 건드리기 **직전**에 부른다. 행을 끼우면 인덱스가 밀려서 그 뒤로는
 * 3-way 병합이 같은 칸을 못 알아보기 때문이다.
 */
export function harvestTableEdits(base: TableSpec, children: ElementLike[]): TableSpec {
  return mergeCanvasCells(base, base, children);
}
