"use client";

/**
 * leviosa-canvas — React 바인딩.
 *
 * mobx의 `observer()` 자리다. 스토어에는 리스너 하나만 두고, **무엇이 바뀌었는지는
 * 스냅샷 숫자로** 가른다. `useSyncExternalStore`는 스냅샷이 같으면 리렌더를 건너뛰므로,
 * 요소 하나를 옮겼을 때 다시 그리는 것은 그 요소(와 구조를 보는 컴포넌트)뿐이다.
 */

import { useSyncExternalStore } from "react";

import type { CanvasElement, CanvasPage, CanvasStore } from "./store";

/** 트리·선택·페이지 구성이 바뀔 때만 리렌더. */
export function useCanvasVersion(store: CanvasStore): number {
  return useSyncExternalStore(
    store.subscribe,
    () => store.version,
    () => store.version,
  );
}

/** 이 요소의 속성이 바뀔 때만 리렌더. */
export function useElementVersion(el: CanvasElement): number {
  const store = el.store;
  return useSyncExternalStore(
    store.subscribe,
    () => el.version,
    () => el.version,
  );
}

export function usePageVersion(page: CanvasPage): number {
  const store = page.store;
  return useSyncExternalStore(
    store.subscribe,
    () => page.version,
    () => page.version,
  );
}

/**
 * 선택 id 목록. 문자열로 합쳐 비교하므로 선택이 안 바뀌면 리렌더가 없다
 * (배열을 그대로 돌려주면 매 알림마다 새 배열로 보여 무한 리렌더가 된다).
 */
export function useSelectionKey(store: CanvasStore): string {
  return useSyncExternalStore(
    store.subscribe,
    () => store.selectedElementsIds.join(","),
    () => store.selectedElementsIds.join(","),
  );
}
