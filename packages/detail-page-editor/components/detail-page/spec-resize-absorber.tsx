"use client";

import { useEffect, useRef, type RefObject } from "react";
import { observer } from "./canvas-observer";

import {
  selectedElementsDeep,
  type SelectableElement,
} from "./detail-page-selection";
import { chartBox, readChartSpec, syncChartGroup } from "../../lib/detail-page/chart/sync";
import { readTableSpec, syncTableGroup, tableBox } from "../../lib/detail-page/table/sync";
import type { ElementLike, StoreLike } from "../../lib/detail-page/spec-group/sync";

/**
 * 차트·표를 트랜스포머로 끈 결과를 **끌기가 멈추자마자** 스펙에 되먹인다.
 *
 * 되먹임 자체는 ``absorbResize``가 재생성 안에서 하지만(``spec-group/sync``), 재생성은
 * 사용자가 값을 고칠 때만 돈다. 그래서 이게 없으면 이런 일이 벌어진다: 세로로 끌면
 * Konva가 자식을 통째로 스케일해 글자까지 커진 모습이 보이고 → 한참 뒤 칸 하나를 고치면
 * 그제야 "글자는 원래 크기, 여백만 늘어난" 진짜 모습으로 다시 그려진다. 사용자에겐
 * 아무 관계 없는 편집이 표를 튀게 만든 걸로 보인다.
 *
 * 끌고 있는 동안 매번 다시 그리면 캔버스가 덜덜 떨기 때문에, 상자가 잠잠해질 때까지
 * 기다렸다 한 번만 돈다.
 */

/** 끌기가 멈춘 걸로 보는 시간. */
const SETTLE_MS = 180;

type AbsorbStore = StoreLike & {
  selectedElementsIds?: string[];
  selectedElements?: SelectableElement[];
  getElementById?: (id: string) => SelectableElement | undefined;
  pages?: Array<{ children?: unknown }>;
};

type Kind = {
  box: (group: ElementLike) => { width: number; height: number } | null;
  sync: (store: StoreLike, group: ElementLike, spec: never) => unknown;
  read: (el: ElementLike) => unknown;
};

const KINDS: Kind[] = [
  {
    read: (el) => readTableSpec(el),
    box: tableBox,
    sync: (store, group, spec) => syncTableGroup(store, group, spec),
  },
  {
    read: (el) => readChartSpec(el),
    box: chartBox,
    sync: (store, group, spec) => syncChartGroup(store, group, spec),
  },
];

function childrenOf(node: { children?: unknown }): ElementLike[] {
  return Array.isArray(node.children) ? (node.children as ElementLike[]) : [];
}

function idsUnder(el: ElementLike, into: Set<string>): Set<string> {
  if (typeof el.id === "string") into.add(el.id);
  for (const kid of childrenOf(el)) idsUnder(kid, into);
  return into;
}

/** 선택이 들어 있는 스펙 그룹(차트든 표든)과 그 종류. */
export function findSpecGroup(
  store: { pages?: Array<{ children?: unknown }> },
  selectedIds: ReadonlyArray<string>,
): { group: ElementLike; kind: Kind } | null {
  if (selectedIds.length === 0) return null;
  for (const page of store.pages ?? []) {
    for (const el of childrenOf(page)) {
      if (el.type !== "group") continue;
      const kind = KINDS.find((candidate) => candidate.read(el));
      if (!kind) continue;
      const inside = idsUnder(el, new Set<string>());
      if (selectedIds.some((id) => inside.has(id))) return { group: el, kind };
    }
  }
  return null;
}

/** 상자가 의미 있게 달라졌는가. 소수점 흔들림으로 재생성이 도는 걸 막는다. */
export function boxChanged(
  a: { width: number; height: number } | null,
  b: { width: number; height: number } | null,
): boolean {
  if (!a || !b) return false;
  return Math.abs(a.width - b.width) > 1 || Math.abs(a.height - b.height) > 1;
}

export const SpecResizeAbsorber = observer(function SpecResizeAbsorber({
  store,
}: {
  store: unknown;
  /** 다른 오버레이와 자리를 맞추기 위해 받지만 쓰지 않는다(그리는 게 없다). */
  containerRef?: RefObject<HTMLElement | null>;
}) {
  const s = store as AbsorbStore;
  const selected = selectedElementsDeep(s);
  const found = findSpecGroup(s, selected.map((e) => String(e.id)));

  // mobx가 자식의 이동·크기 변화를 감지하도록 렌더 중에 읽는다.
  const stamp = found
    ? childrenOf(found.group)
        .map((k) => `${k.id}:${k.x},${k.y},${k.width},${k.height}`)
        .join("|")
    : "";
  const groupId = found ? String(found.group.id) : null;

  const foundRef = useRef(found);
  foundRef.current = found;

  // "저장된 frame과 다른가"가 아니라 "직전에 본 상자와 달라졌는가"로 판정한다. 바탕도
  // 테두리도 없는 표는 자식 합집합이 프레임보다 좁아서, 전자로 걸면 영영 같아지지 않고
  // 재생성이 무한히 돈다.
  const lastBox = useRef<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const current = foundRef.current;
    if (!current) {
      lastBox.current = null;
      return;
    }
    const box = current.kind.box(current.group);
    if (!box) return;
    const previous = lastBox.current;
    if (!previous) {
      lastBox.current = { width: box.width, height: box.height };
      return;
    }
    if (!boxChanged(previous, box)) return;
    const timer = setTimeout(() => {
      const target = foundRef.current;
      if (!target) return;
      const spec = target.kind.read(target.group);
      if (!spec) return;
      target.kind.sync(s, target.group, spec as never);
      const settled = target.kind.box(target.group);
      lastBox.current = settled
        ? { width: settled.width, height: settled.height }
        : null;
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [stamp, groupId, s]);

  return null;
});
SpecResizeAbsorber.displayName = "SpecResizeAbsorber";
