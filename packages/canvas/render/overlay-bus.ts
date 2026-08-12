"use client";

/**
 * 캔버스 위에 잠깐 떴다 사라지는 것들(정렬선·마퀴 상자)을 나르는 통로.
 *
 * 이걸 React 상태로 들고 있으면 **끄는 내내 페이지 전체가 다시 렌더된다** — 요소 200개짜리
 * 섹션에서 프레임마다 트리를 다시 그리게 되고, 그 리렌더가 끌고 있는 Konva 노드의
 * `x/y`를 문서 값으로 되돌려 끌기와 싸운다.
 *
 * 그래서 값은 React 밖에 두고, 그걸 그리는 얇은 층 하나만 구독한다.
 */

import { useSyncExternalStore } from "react";

export type ValueBus<T> = {
  get(): T;
  set(next: T): void;
  subscribe(listener: () => void): () => void;
};

export function createValueBus<T>(initial: T): ValueBus<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(value, next)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useBusValue<T>(bus: ValueBus<T>): T {
  return useSyncExternalStore(bus.subscribe, bus.get, bus.get);
}
