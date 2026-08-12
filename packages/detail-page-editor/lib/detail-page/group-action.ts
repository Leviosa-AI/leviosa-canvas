/**
 * ⌘G / ⌘⇧G(그리고 우클릭 메뉴)가 지금 선택에 대해 무엇을 해야 하는가.
 *
 * 스톡 편집기의 자기 핸들러(``canvas/canvas/hotkeys.js``)는 **첫 번째** 선택 요소만 보고,
 * 그게 마침 그룹이면 그룹을 해제한다.
 *
 *     const e = v.selectedElements[0];
 *     if (e && e.type === "group") { v.ungroupElements([e.id]); }
 *     else { v.groupElements(v.selectedElements.map(e => e.id)); }
 *
 * 그래서 그룹 둘을 shift로 골라 ⌘G를 누르면 중첩되는 게 아니라 첫 그룹이 조용히
 * 풀려 자식들이 페이지로 쏟아진다(``groupElements`` 자체는 그룹 안 그룹을 잘 다룬다 —
 * 핫키의 분기만 틀렸다).
 *
 * 단축키와 메뉴가 같은 판정을 써야 하므로 컴포넌트에서 떼어 놓았다.
 */

/** ``groupAction``이 실제로 읽는 것 전부. */
export type GroupStore = {
  selectedElementsIds?: string[];
  pages?: Array<{ id: string; children?: Array<{ id: string; type?: string }> }>;
};

/**
 * 선택 중 **페이지 직속** 자식인 id들. 그룹 묶기는 형제끼리만 뜻이 있다 — 드릴인해서
 * 고른 그룹 자식을 ⌘G가 새 그룹으로 뽑아낼 이유가 없다.
 */
export function groupableIds(store: GroupStore): string[] {
  const selected = new Set(store.selectedElementsIds ?? []);
  if (!selected.size) return [];
  const out: string[] = [];
  for (const page of store.pages ?? []) {
    for (const child of page.children ?? []) {
      if (selected.has(child.id)) out.push(child.id);
    }
  }
  return out;
}

export function groupAction(
  store: GroupStore,
  shift: boolean,
): { kind: "group" | "ungroup"; ids: string[] } | null {
  const ids = groupableIds(store);
  if (!ids.length) return null;
  const typeOf = (id: string) => {
    for (const page of store.pages ?? []) {
      for (const child of page.children ?? []) {
        if (child.id === id) return child.type;
      }
    }
    return undefined;
  };
  const groups = ids.filter((id) => typeOf(id) === "group");
  // ⌘⇧G는 늘 해제. 그룹 하나만 골라 ⌘G를 눌렀을 때도 해제다(스톡 편집기의 토글을 유지 —
  // 사람들이 이미 익힌 동작).
  if (shift || (ids.length === 1 && groups.length === 1)) {
    return groups.length ? { kind: "ungroup", ids: groups } : null;
  }
  if (ids.length < 2) return null; // 묶을 게 없다
  return { kind: "group", ids };
}
