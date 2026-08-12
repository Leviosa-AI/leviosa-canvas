/**
 * 표 스펙 ↔ Canvas 스토어.
 *
 * 스토어를 만지는 방법은 차트와 똑같아서 ``spec-group/sync``에 한 벌로 있다 —
 * 키 기반 diff, 한 번의 undo, 그룹 base 좌표 0, 자식을 잠그지 않기. **함정 설명은
 * 거기 있다.** 여기서는 "표를 어떻게 그리고 어떻게 알아보는가"만 정한다.
 */

import {
  detachSpecGroup,
  groupBox,
  insertSpecGroup,
  readSpec,
  syncSpecGroup,
  writeSpec,
  type Box,
  type ElementLike,
  type SpecBinding,
  type StoreLike,
} from "../spec-group/sync";

import { harvestTableEdits, mergeCanvasCells } from "./harvest";
import { absorbTableResize, renderTable } from "./render";
import { TABLE_PART, type TableSpec } from "./types";

export type { ElementLike, StoreLike };
export { documentFontFamily } from "../spec-group/sync";

/**
 * 저장된 문서에서 오는 값이라 형태를 믿지 않는다 — 최소한의 골격(버전·행 배열)만
 * 확인하고, 세부 필드는 렌더러의 기본값 처리에 맡긴다.
 */
function parseTableSpec(raw: unknown): TableSpec | null {
  const spec = raw as Partial<TableSpec>;
  if (spec.v !== 1) return null;
  if (spec.kind !== "keyvalue" && spec.kind !== "grid") return null;
  if (!spec.data || !Array.isArray(spec.data.columns)) return null;
  if (!Array.isArray(spec.data.rows)) return null;
  if (!spec.data.rows.every((row) => Array.isArray(row))) return null;
  return spec as TableSpec;
}

const TABLE_BINDING: SpecBinding<TableSpec> = {
  customKey: "table",
  partKey: TABLE_PART,
  defaultName: "표",
  render: renderTable,
  parse: parseTableSpec,
  absorbResize: absorbTableResize,
  harvest: mergeCanvasCells,
};

/** 그룹에서 표 스펙을 꺼낸다. 표가 아니면 ``null``. */
export function readTableSpec(el: ElementLike | null | undefined): TableSpec | null {
  return readSpec(TABLE_BINDING, el);
}

/** 스펙을 그룹에 되쓴다(다른 custom 키는 보존). */
export function writeTableSpec(el: ElementLike, spec: TableSpec): void {
  writeSpec(TABLE_BINDING, el, spec);
}

/** 그룹이 실제로 차지하는 상자. 그룹 모델이 아니라 자식에서 잰다. */
export function tableBox(group: ElementLike): Box | null {
  return groupBox(group);
}

export type InsertTableOptions = {
  /** 프레임 좌상단(페이지 좌표). 없으면 페이지 가운데. */
  origin?: { x: number; y: number };
  /** 레이어 트리에 뜰 이름. */
  name?: string;
};

/** 새 표를 페이지에 놓고 그 그룹을 돌려준다. */
export function insertTable(
  store: StoreLike,
  spec: TableSpec,
  options: InsertTableOptions = {},
): ElementLike | null {
  return insertSpecGroup(TABLE_BINDING, store, spec, options);
}

/** 스펙이 바뀐 표를 다시 그린다. 저장된 스펙(실제 frame이 채워진)을 돌려준다. */
export function syncTableGroup(
  store: StoreLike,
  group: ElementLike,
  next: TableSpec,
): TableSpec {
  return syncSpecGroup(TABLE_BINDING, store, group, next);
}

/**
 * 캔버스에서 고친 칸 글자를 반영한 스펙. 바뀐 게 없으면 ``spec``을 그대로 돌려준다.
 *
 * 다시 그리지 않는다 — 글자를 막 고친 참에 재생성하면 편집 중인 텍스트 상자가 통째로
 * 갈려 포커스가 날아간다. 행·열을 건드리기 직전과, 칸 편집을 마쳤을 때 부른다.
 */
export function harvestTableGroup(group: ElementLike, spec: TableSpec): TableSpec {
  const kids = Array.isArray(group.children) ? (group.children as ElementLike[]) : [];
  return harvestTableEdits(spec, kids);
}

/** 표를 일반 그룹으로 푼다(되돌리기는 제공하지 않는다). */
export function detachTable(group: ElementLike): void {
  detachSpecGroup(TABLE_BINDING, group);
}
