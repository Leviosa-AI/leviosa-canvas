/**
 * jsdom이 안 싣는 것만 채운다.
 *
 * 엔진은 앱 프레임워크를 하나도 안 부르므로(`next/*`·`react-i18next` 없음) 여기에
 * 목이 필요 없다. 그게 이 패키지가 따로 설 수 있는 이유이기도 하다 — 이 파일이
 * 자라기 시작하면 경계가 새고 있다는 뜻이다.
 */

import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";

import { cleanup } from "@testing-library/react";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  cleanup();
});
