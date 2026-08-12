import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearElementRecents,
  getElementRecents,
  isElementPinned,
  rememberElement,
  resetElementRecentsCache,
  subscribeElementRecents,
  toggleElementPin,
  type ElementRecent,
} from "../element-recents";

const STORAGE_KEY = "leviosa.detail-page.element-recents";

function entry(key: string): ElementRecent {
  return { key, markup: `<svg viewBox="0 0 24 24"><path d="${key}"/></svg>`, viewBox: "0 0 24 24" };
}

beforeEach(() => {
  localStorage.clear();
  resetElementRecentsCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rememberElement", () => {
  it("넣은 것이 맨 앞에 온다", () => {
    rememberElement(entry("a"));
    rememberElement(entry("b"));
    expect(getElementRecents().recent.map((e) => e.key)).toEqual(["b", "a"]);
  });

  it("이미 있는 것은 앞으로 끌어올린다 — 늘어나지 않는다", () => {
    rememberElement(entry("a"));
    rememberElement(entry("b"));
    rememberElement(entry("a"));
    expect(getElementRecents().recent.map((e) => e.key)).toEqual(["a", "b"]);
  });

  it("24개를 넘으면 오래된 것부터 버린다", () => {
    for (let i = 0; i < 30; i += 1) rememberElement(entry(`i${i}`));
    const recent = getElementRecents().recent;
    expect(recent).toHaveLength(24);
    expect(recent[0].key).toBe("i29");
    expect(recent.map((e) => e.key)).not.toContain("i0");
  });

  it("새로고침해도 남는다", () => {
    rememberElement(entry("a"));
    resetElementRecentsCache();
    expect(getElementRecents().recent.map((e) => e.key)).toEqual(["a"]);
  });
});

describe("toggleElementPin", () => {
  it("꽂고 뺀다", () => {
    toggleElementPin(entry("a"));
    expect(isElementPinned("a")).toBe(true);
    toggleElementPin(entry("a"));
    expect(isElementPinned("a")).toBe(false);
  });

  it("최근을 비워도 즐겨찾기는 남는다 — 사람이 직접 고른 것이다", () => {
    rememberElement(entry("a"));
    toggleElementPin(entry("a"));
    clearElementRecents();
    expect(getElementRecents().recent).toEqual([]);
    expect(isElementPinned("a")).toBe(true);
  });
});

describe("저장소를 못 믿을 때", () => {
  it("깨진 JSON에 멈추지 않는다", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    resetElementRecentsCache();
    expect(getElementRecents()).toEqual({ recent: [], pinned: [] });
  });

  it("모양이 안 맞는 항목은 걸러 낸다", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ recent: [{ key: "a" }, entry("b"), null, 3], pinned: "nope" }),
    );
    resetElementRecentsCache();
    const state = getElementRecents();
    expect(state.recent.map((e) => e.key)).toEqual(["b"]);
    expect(state.pinned).toEqual([]);
  });

  it("저장이 막혀도 던지지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => rememberElement(entry("a"))).not.toThrow();
    // 이번 세션 동안은 메모리로 산다.
    expect(getElementRecents().recent.map((e) => e.key)).toEqual(["a"]);
  });

  it("한 항목이 예산을 통째로 먹으면 최근을 비워서라도 저장을 시도한다", () => {
    rememberElement({
      key: "huge",
      markup: `<svg>${"x".repeat(600 * 1024)}</svg>`,
      viewBox: "0 0 24 24",
    });
    // 예산을 넘겨 잘렸어도 상태는 성립한다(빈 최근).
    expect(getElementRecents().recent).toEqual([]);
  });
});

describe("subscribeElementRecents", () => {
  it("바뀔 때마다 알린다", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeElementRecents(listener);
    rememberElement(entry("a"));
    expect(listener).toHaveBeenCalledOnce();
    toggleElementPin(entry("a"));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    rememberElement(entry("b"));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
