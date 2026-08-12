"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { observer } from "./canvas-observer";
import { useTranslation } from "react-i18next";

import {
  selectedElementsDeep,
  type SelectableElement,
} from "./detail-page-selection";
import {
  elementClientRect,
  type ClientRect,
  type RectElement,
} from "./element-rects";
import {
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
} from "../../lib/detail-page/table/edit";
import { tableLayout } from "../../lib/detail-page/table/render";
import {
  harvestTableGroup,
  readTableSpec,
  syncTableGroup,
  type ElementLike,
  type StoreLike,
} from "../../lib/detail-page/table/sync";
import type { TableSpec } from "../../lib/detail-page/table/types";

/**
 * 표를 **캔버스에서** 만지는 층 — Canva·미리캔버스식 행·열 조작과 리사이즈 되먹임.
 *
 * 우측 인스펙터만으로도 다 되지만, 표를 보면서 그 자리에서 행을 끼우는 것과 패널의 목록을
 * 내려가며 고치는 것은 다른 작업이다.
 *
 * 표 왼쪽·위에 레일을 깔고 행/열마다 삭제, 경계마다 삽입 버튼을 둔다. 좌표는
 * ``tableLayout``에서 온다 — 렌더러가 쓰는 바로 그 배치라, 핸들이 행 경계에서 어긋날 수
 * 없다. 행·열을 건드리기 전에는 캔버스에서 고친 글자를 먼저 걷는다(인덱스가 밀리면
 * 되받기가 같은 칸을 못 알아본다).
 *
 * 리사이즈 되먹임은 여기 없다 — 차트도 똑같이 필요해서 ``SpecResizeAbsorber``가 맡는다.
 *
 * 좌표계 규약은 ``BubbleTailOverlay``와 같다: Konva 노드에서 잰 rect를 컨테이너 기준으로
 * 옮기므로 줌·스크롤·스택 워크스페이스가 그대로 동작한다. 무한 루프 방지 규약도 같다 —
 * 계산 결과를 요약한 키가 그대로면 상태를 아예 건드리지 않는다.
 */

const RAIL = 18; // 레일 두께(px)
/** 레일 바깥에 ``+``가 앉는 여백. 레일과 한 hover 영역으로 묶인다. */
const GUTTER = 14;
const ACCENT = "#2F6FEB";

type SelectionStore = {
  selectedElementsIds?: string[];
  selectedElements?: SelectableElement[];
  getElementById?: (id: string) => SelectableElement | undefined;
  pages?: Array<{ children?: unknown }>;
  scale?: number;
};

type OverlayStore = StoreLike & SelectionStore;

// ── 순수 계산 ────────────────────────────────────────────────────────────────

function childrenOf(node: { children?: unknown }): ElementLike[] {
  return Array.isArray(node.children) ? (node.children as ElementLike[]) : [];
}

function idsUnder(el: ElementLike, into: Set<string>): Set<string> {
  if (typeof el.id === "string") into.add(el.id);
  for (const kid of childrenOf(el)) idsUnder(kid, into);
  return into;
}

/**
 * 선택이 어느 표 안에 있는가.
 *
 * 그룹 자체가 선택된 경우와, 드릴인해서 **칸 하나**가 선택된 경우를 모두 받는다. 칸을
 * 고치는 중에 레일이 사라지면 "행 추가"를 누르러 매번 표를 다시 골라야 한다.
 */
export function findTableGroup(
  store: { pages?: Array<{ children?: unknown }> },
  selectedIds: ReadonlyArray<string>,
): ElementLike | null {
  if (selectedIds.length === 0) return null;
  const wanted = new Set(selectedIds);
  for (const page of store.pages ?? []) {
    for (const el of childrenOf(page)) {
      if (el.type !== "group") continue;
      if (!readTableSpec(el)) continue;
      const inside = idsUnder(el, new Set<string>());
      if (selectedIds.some((id) => inside.has(id)) || wanted.has(String(el.id))) {
        return el;
      }
    }
  }
  return null;
}

/** 레일 위의 한 칸(행 하나 또는 열 하나). 컨테이너 기준 좌표. */
export type Track = { index: number; start: number; size: number };
/** 삽입 자리. ``index``는 "여기에 끼운다"는 위치다(행 수와 같으면 맨 뒤). */
export type Boundary = { index: number; at: number };

export type RailGeometry = {
  /** 표 상자(컨테이너 기준). */
  left: number;
  top: number;
  width: number;
  height: number;
  /**
   * 화면 px ÷ 페이지 px. 드래그 거리를 스펙 단위로 되돌릴 때 쓴다 — 줌이 걸려 있으면
   * 화면에서 10px 끈 게 스펙에서는 10px이 아니다.
   */
  sx: number;
  sy: number;
  rows: Track[];
  rowBoundaries: Boundary[];
  columns: Track[];
  columnBoundaries: Boundary[];
};

/** 좌표가 어느 경계에 제일 가까운가. 순서 바꾸기의 드롭 자리를 정한다. */
export function nearestBoundary(boundaries: Boundary[], at: number): number {
  let best = 0;
  let distance = Infinity;
  for (const boundary of boundaries) {
    const gap = Math.abs(boundary.at - at);
    if (gap < distance) {
      distance = gap;
      best = boundary.index;
    }
  }
  return best;
}

/**
 * 경계 번호를 배열 인덱스로 바꾼다.
 *
 * ``moveRow(from, to)``의 ``to``는 **빼낸 뒤**의 자리다. 자기 뒤쪽 경계에 떨어뜨리면
 * 자기가 빠지면서 한 칸 당겨지므로 1을 뺀다. 이걸 빼먹으면 아래로 한 칸 옮기려 할 때
 * 제자리에 남는다.
 */
export function dropIndex(from: number, boundary: number): number {
  return boundary > from ? boundary - 1 : boundary;
}

/**
 * 스펙의 배치를 화면 좌표로 옮긴다.
 *
 * 배율은 상자 크기 ÷ 배치 크기로 잰다 — 사용자가 방금 끌어서 자식이 스케일된 상태여도
 * (아직 흡수 전) 비율은 그대로라 핸들이 표를 따라간다.
 */
export function railGeometry(
  spec: TableSpec,
  rect: ClientRect,
  origin: { left: number; top: number },
): RailGeometry {
  const layout = tableLayout(spec);
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const sx = layout.width > 0 ? width / layout.width : 1;
  const sy = layout.height > 0 ? height / layout.height : 1;
  const left = rect.left - origin.left;
  const top = rect.top - origin.top;

  const rows: Track[] = layout.rows.map((row, index) => ({
    index,
    start: top + row.y * sy,
    size: row.height * sy,
  }));
  const rowBoundaries: Boundary[] = rows.map((row) => ({
    index: row.index,
    at: row.start,
  }));
  const last = rows[rows.length - 1];
  if (last) rowBoundaries.push({ index: rows.length, at: last.start + last.size });

  const columns: Track[] = layout.columns.map((column, index) => ({
    index,
    start: left + column.x * sx,
    size: column.width * sx,
  }));
  const columnBoundaries: Boundary[] = columns.map((column) => ({
    index: column.index,
    at: column.start,
  }));
  const lastColumn = columns[columns.length - 1];
  if (lastColumn) {
    columnBoundaries.push({
      index: columns.length,
      at: lastColumn.start + lastColumn.size,
    });
  }

  return {
    left,
    top,
    width,
    height,
    sx,
    sy,
    rows,
    rowBoundaries,
    columns,
    columnBoundaries,
  };
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

type Op = (spec: TableSpec) => TableSpec;

/**
 * 진행 중인 드래그.
 *
 * 끄는 동안에는 스펙을 안 고친다 — mousemove마다 표 전체를 다시 그리면 캔버스가 덜덜
 * 떨고 undo가 수십 단계로 쪼개진다. 안내선만 그리고 손을 뗄 때 한 번 적용한다.
 */
type Drag =
  /** 열 경계를 좌우로: 인접 두 열이 폭을 주고받는다. */
  | { mode: "width"; boundary: number; startX: number; deltaX: number }
  /** 행·열 레일을 잡아 순서 바꾸기. ``target``은 떨어뜨릴 경계 번호. */
  | { mode: "row"; from: number; target: number; startY: number; moved: boolean }
  | { mode: "column"; from: number; target: number; startX: number; moved: boolean };

/** 이만큼 움직이기 전에는 순서 바꾸기가 아니라 그냥 누른 것으로 본다. */
const DRAG_SLOP = 4;

export const TableCanvasOverlay = observer(function TableCanvasOverlay({
  store,
  containerRef,
}: {
  store: unknown;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation("branding");
  const s = store as OverlayStore;
  const [geometry, setGeometry] = useState<RailGeometry | null>(null);
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [hoverColumn, setHoverColumn] = useState<number | null>(null);
  const [rowsHot, setRowsHot] = useState(false);
  const [columnsHot, setColumnsHot] = useState(false);
  /**
   * 드래그 상태는 **ref가 정본**이고, ``dragView``는 안내선을 그리기 위한 사본이다.
   *
   * ``pointermove``는 discrete 이벤트가 아니라 setState가 미뤄질 수 있다. 상태만 쓰면
   * ``pointerup``이 낡은 값을 읽어 **끈 결과가 통째로 사라진다**(테스트에서 잡혔다).
   */
  const dragRef = useRef<Drag | null>(null);
  const [dragView, setDragView] = useState<Drag | null>(null);
  /** 컨테이너 좌상단(클라이언트 좌표) — 포인터를 기하와 같은 좌표계로 옮긴다. */
  const hostOrigin = useRef({ left: 0, top: 0 });

  const selected = selectedElementsDeep(s);
  const group = findTableGroup(s, selected.map((e) => String(e.id)));
  const spec = group ? readTableSpec(group) : null;

  // mobx가 자식의 이동·크기 변화를 감지하도록 렌더 중에 읽는다. 글자는 안 읽는다 —
  // 되받기는 재생성 직전(sync)과 패널이 읽을 때 일어나므로 여기서 반응할 필요가 없고,
  // 타이핑마다 오버레이가 다시 그려지는 것도 피한다.
  const stamp = group
    ? childrenOf(group)
        .map((k) => `${k.id}:${k.x},${k.y},${k.width},${k.height}`)
        .join("|")
    : "";
  const scale = s.scale ?? 1;
  const groupId = group ? String(group.id) : null;

  // selectedElementsDeep은 매 렌더 새 배열을 만든다 — 의존성에 두면 이펙트가 매 렌더
  // 돌고 setState가 다시 렌더를 부른다(무한 루프). 내용을 요약한 stamp로만 건다.
  const groupRef = useRef<ElementLike | null>(group);
  groupRef.current = group;
  const specRef = useRef<TableSpec | null>(spec);
  specRef.current = spec;
  const keyRef = useRef<string | null>(null);

  // ── 레일 좌표 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const host = containerRef.current;
    const el = groupRef.current;
    const current = specRef.current;
    let next: RailGeometry | null = null;
    if (host && el && current) {
      const rect = elementClientRect(el as unknown as RectElement);
      if (rect) {
        const box = host.getBoundingClientRect();
        hostOrigin.current = { left: box.left, top: box.top };
        next = railGeometry(current, rect, { left: box.left, top: box.top });
      }
    }
    const key = next
      ? `${groupId}:${next.left.toFixed(1)},${next.top.toFixed(1)},${next.width.toFixed(1)},${next.height.toFixed(1)},${next.rows.length},${next.columns.length}`
      : null;
    if (key === keyRef.current) return;
    keyRef.current = key;
    setGeometry(next);
  }, [stamp, scale, groupId, containerRef]);

  /** 행·열을 건드리기 전에 캔버스 글자를 먼저 걷는다(인덱스가 밀리기 전에). */
  const run = (op: Op) => {
    const el = groupRef.current;
    const current = specRef.current;
    if (!el || !current) return;
    const harvested = harvestTableGroup(el, current);
    const next = op(harvested);
    if (next === harvested) return;
    syncTableGroup(s, el, next);
  };

  // ── 드래그 ────────────────────────────────────────────────────────────────
  const geometryRef = useRef<RailGeometry | null>(geometry);
  geometryRef.current = geometry;

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, next: Drag) => {
    event.preventDefault();
    // 캔버스로 내려가면 스톡 편집기가 표를 잡아 끌기 시작한다.
    event.stopPropagation();
    // 캡처를 못 잡아도(포인터 캡처가 없는 환경) 드래그 자체는 돌아야 한다.
    const target = event.currentTarget;
    if (typeof target.setPointerCapture === "function") {
      target.setPointerCapture(event.pointerId);
    }
    dragRef.current = next;
    setDragView(next);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const box = geometryRef.current;
    const current = dragRef.current;
    if (!box || !current) return;
    const x = event.clientX - hostOrigin.current.left;
    const y = event.clientY - hostOrigin.current.top;

    let next: Drag;
    if (current.mode === "width") {
      next = { ...current, deltaX: event.clientX - current.startX };
    } else if (current.mode === "row") {
      next = {
        ...current,
        moved: current.moved || Math.abs(event.clientY - current.startY) > DRAG_SLOP,
        target: nearestBoundary(box.rowBoundaries, y),
      };
    } else {
      next = {
        ...current,
        moved: current.moved || Math.abs(event.clientX - current.startX) > DRAG_SLOP,
        target: nearestBoundary(box.columnBoundaries, x),
      };
    }
    dragRef.current = next;
    setDragView(next);
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = dragRef.current;
    dragRef.current = null;
    setDragView(null);
    if (!current) return;
    event.stopPropagation();
    const box = geometryRef.current;
    if (current.mode === "width") {
      // 화면에서 끈 거리를 페이지 단위로 되돌린다(줌이 걸려 있으면 다르다).
      const sx = box?.sx || 1;
      const delta = current.deltaX / sx;
      if (Math.abs(delta) >= 1) {
        run((table) => resizeColumn(table, current.boundary, delta));
      }
      return;
    }
    if (!current.moved) return; // 잡기만 하고 안 옮겼다
    const to = dropIndex(current.from, current.target);
    if (to === current.from) return;
    run((table) =>
      current.mode === "row"
        ? moveRow(table, current.from, to)
        : moveColumn(table, current.from, to),
    );
  };

  const dragHandlers = {
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };

  if (!geometry || !spec) return null;

  const showColumns = spec.kind === "grid";
  const canAddRow = canInsertRow(spec);
  const canDropRow = canRemoveRow(spec);
  const canAddColumn = canInsertColumn(spec);
  const canDropColumn = canRemoveColumn(spec);

  const chip: CSSProperties = {
    position: "absolute",
    display: "grid",
    placeItems: "center",
    borderRadius: 999,
    background: "#fff",
    border: `1px solid ${ACCENT}`,
    color: ACCENT,
    fontSize: 11,
    lineHeight: 1,
    fontWeight: 600,
    pointerEvents: "auto",
    cursor: "pointer",
    padding: 0,
  };

  // 레일과 그 바깥의 ``+`` 줄을 **한 영역**으로 감싼다. 버튼마다 hover를 걸면 행 칸에서
  // 버튼으로 넘어가는 순간 leave가 먼저 떠서 버튼이 사라지고, 누를 수가 없다.
  const rowsRailLeft = Math.max(0, geometry.left - RAIL - GUTTER);
  const columnsRailTop = Math.max(0, geometry.top - RAIL - GUTTER);
  const railSkin = (hot: boolean): CSSProperties => ({
    position: "absolute",
    pointerEvents: "auto",
    opacity: hot ? 1 : 0.35,
    transition: "opacity 120ms",
  });

  return (
    <div
      data-dp-table-rail
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 22 }}
    >
      {/* ── 행 레일(왼쪽) ─────────────────────────────────────────────────── */}
      <div
        onPointerEnter={() => setRowsHot(true)}
        onPointerLeave={() => {
          setRowsHot(false);
          setHoverRow(null);
        }}
        style={{
          ...railSkin(rowsHot),
          left: rowsRailLeft,
          top: geometry.top,
          width: geometry.left - rowsRailLeft,
          height: geometry.height,
        }}
      >
        {geometry.rows.map((row) => (
          <div
            key={`row-${row.index}`}
            data-dp-row-grip={row.index}
            title={t("detailPage.table.rail.moveRow")}
            onPointerEnter={() => setHoverRow(row.index)}
            onPointerDown={(e) =>
              beginDrag(e, {
                mode: "row",
                from: row.index,
                target: row.index,
                startY: e.clientY,
                moved: false,
              })
            }
            {...dragHandlers}
            style={{
              position: "absolute",
              left: GUTTER,
              top: row.start - geometry.top,
              width: RAIL,
              height: row.size,
              borderRadius: 3,
              cursor: "grab",
              touchAction: "none",
              background:
                hoverRow === row.index ? "rgba(47,111,235,0.14)" : "rgba(47,111,235,0.05)",
            }}
          >
            {canDropRow && hoverRow === row.index ? (
              <button
                type="button"
                data-dp-row-remove={row.index}
                aria-label={t("detailPage.table.rail.removeRow", { row: row.index + 1 })}
                title={t("detailPage.table.rail.removeRow", { row: row.index + 1 })}
                onClick={() => run((current) => removeRow(current, row.index))}
                style={{ ...chip, left: (RAIL - 16) / 2, top: row.size / 2 - 8, width: 16, height: 16 }}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}

        {/* 경계마다 "여기에 행 추가". 마지막 경계는 표 맨 아래다. */}
        {canAddRow
          ? geometry.rowBoundaries.map((boundary) => (
              <button
                key={`row-add-${boundary.index}`}
                type="button"
                data-dp-row-insert={boundary.index}
                aria-label={t("detailPage.table.rail.insertRow", {
                  at: boundary.index + 1,
                })}
                title={t("detailPage.table.rail.insertRow", { at: boundary.index + 1 })}
                onClick={() => run((current) => insertRow(current, boundary.index))}
                style={{
                  ...chip,
                  left: 0,
                  top: boundary.at - geometry.top - 7,
                  width: 14,
                  height: 14,
                }}
              >
                +
              </button>
            ))
          : null}
      </div>

      {/* ── 열 경계 끌기(표 위) ───────────────────────────────────────────
          엑셀·Canva처럼 열 구분선 자체를 잡아 끈다. 인접 두 열이 폭을 주고받으므로
          표 전체 폭은 안 변한다. 첫 경계(0)와 마지막은 표 바깥이라 뺀다. */}
      {geometry.columns.length > 1
        ? geometry.columnBoundaries
            .filter((b) => b.index > 0 && b.index < geometry.columns.length)
            .map((boundary) => (
              <div
                key={`col-size-${boundary.index}`}
                data-dp-col-resize={boundary.index}
                title={t("detailPage.table.rail.resizeColumn")}
                onPointerDown={(e) =>
                  beginDrag(e, {
                    mode: "width",
                    boundary: boundary.index,
                    startX: e.clientX,
                    deltaX: 0,
                  })
                }
                {...dragHandlers}
                style={{
                  position: "absolute",
                  left: boundary.at - 3,
                  top: geometry.top,
                  width: 6,
                  height: geometry.height,
                  cursor: "col-resize",
                  touchAction: "none",
                  pointerEvents: "auto",
                }}
              />
            ))
        : null}

      {/* 끄는 동안의 안내선 — 스펙은 손을 뗄 때 한 번만 고친다. */}
      {dragView?.mode === "width" ? (
        <div
          data-dp-drag-guide="width"
          style={{
            position: "absolute",
            left:
              (geometry.columnBoundaries.find((b) => b.index === dragView.boundary)?.at ??
                0) + dragView.deltaX,
            top: geometry.top,
            width: 2,
            height: geometry.height,
            background: ACCENT,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {dragView?.mode === "row" && dragView.moved ? (
        <div
          data-dp-drag-guide="row"
          style={{
            position: "absolute",
            left: geometry.left,
            top:
              (geometry.rowBoundaries.find((b) => b.index === dragView.target)?.at ?? 0) - 1,
            width: geometry.width,
            height: 2,
            background: ACCENT,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {dragView?.mode === "column" && dragView.moved ? (
        <div
          data-dp-drag-guide="column"
          style={{
            position: "absolute",
            left:
              (geometry.columnBoundaries.find((b) => b.index === dragView.target)?.at ?? 0) -
              1,
            top: geometry.top,
            width: 2,
            height: geometry.height,
            background: ACCENT,
            pointerEvents: "none",
          }}
        />
      ) : null}

      {/* ── 열 레일(위) ──────────────────────────────────────────────────── */}
      {showColumns ? (
        <div
          onPointerEnter={() => setColumnsHot(true)}
          onPointerLeave={() => {
            setColumnsHot(false);
            setHoverColumn(null);
          }}
          style={{
            ...railSkin(columnsHot),
            left: geometry.left,
            top: columnsRailTop,
            width: geometry.width,
            height: geometry.top - columnsRailTop,
          }}
        >
          {geometry.columns.map((column) => (
            <div
              key={`col-${column.index}`}
              data-dp-col-grip={column.index}
              title={t("detailPage.table.rail.moveColumn")}
              onPointerEnter={() => setHoverColumn(column.index)}
              onPointerDown={(e) =>
                beginDrag(e, {
                  mode: "column",
                  from: column.index,
                  target: column.index,
                  startX: e.clientX,
                  moved: false,
                })
              }
              {...dragHandlers}
              style={{
                position: "absolute",
                left: column.start - geometry.left,
                top: GUTTER,
                width: column.size,
                height: RAIL,
                borderRadius: 3,
                cursor: "grab",
                touchAction: "none",
                background:
                  hoverColumn === column.index
                    ? "rgba(47,111,235,0.14)"
                    : "rgba(47,111,235,0.05)",
              }}
            >
              {canDropColumn && hoverColumn === column.index ? (
                <button
                  type="button"
                  data-dp-col-remove={column.index}
                  aria-label={t("detailPage.table.rail.removeColumn", {
                    column: column.index + 1,
                  })}
                  title={t("detailPage.table.rail.removeColumn", {
                    column: column.index + 1,
                  })}
                  onClick={() => run((current) => removeColumn(current, column.index))}
                  style={{ ...chip, left: column.size / 2 - 8, top: (RAIL - 16) / 2, width: 16, height: 16 }}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}

          {canAddColumn
            ? geometry.columnBoundaries.map((boundary) => (
                <button
                  key={`col-add-${boundary.index}`}
                  type="button"
                  data-dp-col-insert={boundary.index}
                  aria-label={t("detailPage.table.rail.insertColumn", {
                    at: boundary.index + 1,
                  })}
                  title={t("detailPage.table.rail.insertColumn", {
                    at: boundary.index + 1,
                  })}
                  onClick={() => run((current) => insertColumn(current, boundary.index))}
                  style={{
                    ...chip,
                    left: boundary.at - geometry.left - 7,
                    top: 0,
                    width: 14,
                    height: 14,
                  }}
                >
                  +
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
});
TableCanvasOverlay.displayName = "TableCanvasOverlay";
