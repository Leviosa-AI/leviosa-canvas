/**
 * 표·차트가 우리 엔진 위에서 돈다 (G4).
 *
 * 관문 문서는 이 일을 "1,238줄 UI 이식"으로 잡아 뒀는데, 열어 보니 표·차트는
 * **스토어를 구조적 타입으로만** 받는다(`spec-group/sync`의 `StoreLike`·`ElementLike`).
 * 스톡 SDK 클래스를 부르는 자리가 한 곳도 없다. 그래서 할 일은 이식이 아니라 배선이고,
 * 그 배선이 맞는지는 **진짜 표·차트 모듈을 우리 스토어에 물려 돌려 보는 것**으로만
 * 증명된다 — 흉내 낸 목으로는 계약이 어긋난 걸 못 잡는다.
 *
 * 여기서 부르는 함수는 전부 프로덕션이 쓰는 그것이다. 한 줄도 안 고쳤다.
 */

import { describe, expect, it } from "vitest";

import { legacyStoreFacade } from "@/components/detail-page/canvas-store-facade";
import { createChartSpec } from "@/lib/detail-page/chart/defaults";
import { chartBox, insertChart, readChartSpec, syncChartGroup } from "@/lib/detail-page/chart/sync";
import { createTableSpec } from "@/lib/detail-page/table/defaults";
import { insertColumn, insertRow, removeRow } from "@/lib/detail-page/table/edit";
import {
  harvestTableGroup,
  insertTable,
  readTableSpec,
  syncTableGroup,
  tableBox,
} from "@/lib/detail-page/table/sync";
import { createCanvasStore, type CanvasElement } from "@/lib/leviosa-canvas/store";
import type { DocumentJson } from "@/lib/leviosa-canvas/types";

function emptyDoc(): DocumentJson {
  return { width: 860, height: 1200, pages: [{ id: "p1", children: [] }] };
}

function withTable() {
  const store = createCanvasStore(emptyDoc());
  const group = insertTable(legacyStoreFacade(store), createTableSpec()) as CanvasElement | null;
  return { store, group: group as CanvasElement };
}

function cellTexts(group: CanvasElement): string[] {
  return group.children
    .filter((kid) => kid.type === "text")
    .map((kid) => String(kid.text ?? ""));
}

describe("표를 우리 스토어에 꽂는다", () => {
  it("그룹 하나로 들어가고 부품이 밖에 안 흩어진다", () => {
    const { store, group } = withTable();
    expect(group).toBeTruthy();
    expect(group.isContainer).toBe(true);
    expect(group.children.length).toBeGreaterThan(0);
    expect(store.pages[0].children).toHaveLength(1);
    expect(store.pages[0].children[0]).toBe(group);
  });

  it("스펙이 그룹에 실려 다시 읽히고 실제 높이가 되먹여진다", () => {
    const { group } = withTable();
    const back = readTableSpec(group);
    expect(back?.v).toBe(1);
    // frame.height는 다음 리사이즈 판정의 기준이다 — 0이면 "늘렸는지"를 못 잰다.
    expect(back!.frame.height).toBeGreaterThan(0);
  });

  it("그룹 좌표 계약을 지킨다 — 그룹은 0이고 자식이 페이지 좌표를 든다", () => {
    const { group } = withTable();
    expect(group.x).toBe(0);
    expect(group.y).toBe(0);
    // 페이지 가운데에 놓았으니 자식은 0이 아닌 페이지 좌표에 있어야 한다.
    const box = tableBox(group)!;
    expect(box.x).toBeGreaterThan(0);
    expect(box.y).toBeGreaterThan(0);
  });
});

describe("표를 고치면 같은 그룹 안에서 다시 그려진다", () => {
  it("행이 늘어도 그룹 id와 좌상단이 그대로다", () => {
    const { store, group } = withTable();
    const id = group.id;
    const beforeBox = tableBox(group)!;
    const beforeCells = cellTexts(group).length;

    syncTableGroup(legacyStoreFacade(store), group, insertRow(readTableSpec(group)!, 1));

    const after = store.getElementById(id);
    expect(after).not.toBeNull();
    const afterBox = tableBox(after!)!;
    // 데이터를 고쳤다고 표가 페이지 가운데로 튀면 안 된다.
    expect(afterBox.x).toBeCloseTo(beforeBox.x, 3);
    expect(afterBox.y).toBeCloseTo(beforeBox.y, 3);
    expect(cellTexts(after!).length).toBeGreaterThan(beforeCells);
    expect(store.pages[0].children).toHaveLength(1);
  });

  it("열을 끼웠다 행을 빼도 페이지에 부스러기가 안 남는다", () => {
    const { store, group } = withTable();
    const id = group.id;

    syncTableGroup(legacyStoreFacade(store), group, insertColumn(readTableSpec(group)!, 1));
    const mid = store.getElementById(id)!;
    syncTableGroup(legacyStoreFacade(store), mid, removeRow(readTableSpec(mid)!, 1));

    expect(store.pages[0].children).toHaveLength(1);
    expect(store.pages[0].children[0].id).toBe(id);
  });

  it("캔버스에서 고친 글자를 되받는다", () => {
    const { group } = withTable();
    const spec = readTableSpec(group)!;
    const cell = group.children.find((kid) => kid.type === "text")!;
    cell.set({ text: "손으로 고친 값" });

    const harvested = harvestTableGroup(group, spec);
    const flat = [...harvested.data.rows.flat(), ...harvested.data.columns];
    expect(flat).toContain("손으로 고친 값");
  });

  it("한 번 고치면 undo 한 번으로 돌아온다", () => {
    const { store, group } = withTable();
    const id = group.id;
    store.history.clear();
    const before = cellTexts(group).length;

    syncTableGroup(legacyStoreFacade(store), group, insertRow(readTableSpec(group)!, 1));
    expect(cellTexts(store.getElementById(id)!).length).toBeGreaterThan(before);

    // 부품을 여럿 갈아 끼우는 일이지만 트랜잭션으로 묶여 있어 undo 한 번이다.
    store.history.undo();
    expect(cellTexts(store.getElementById(id)!).length).toBe(before);
  });
});

describe("차트도 같은 코어를 탄다", () => {
  it("꽂히고, 값을 고쳐도 제자리에서 다시 그려진다", () => {
    const store = createCanvasStore(emptyDoc());
    const group = insertChart(legacyStoreFacade(store), createChartSpec({ width: 600 })) as CanvasElement | null;
    expect(group).toBeTruthy();

    const beforeBox = chartBox(group!)!;
    const stored = readChartSpec(group!)!;
    syncChartGroup(legacyStoreFacade(store), group!, {
      ...stored,
      data: {
        ...stored.data,
        series: stored.data.series.map((one) => ({
          ...one,
          values: one.values.map((value) => (value === null ? null : value / 2)),
        })),
      },
    });

    const after = store.getElementById(group!.id)!;
    const afterBox = chartBox(after)!;
    expect(afterBox.x).toBeCloseTo(beforeBox.x, 3);
    expect(afterBox.y).toBeCloseTo(beforeBox.y, 3);
    expect(store.pages[0].children).toHaveLength(1);
  });
});
