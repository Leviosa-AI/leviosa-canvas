import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useFakeProgress } from "../use-fake-progress";

describe("useFakeProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("비활성이면 0을 유지한다", () => {
    const { result } = renderHook(() => useFakeProgress(false, 1000));
    expect(result.current).toBe(0);
  });

  it("활성 동안 0에서 시작해 증가하되 100%엔 닿지 않는다", () => {
    const { result } = renderHook(() => useFakeProgress(true, 1000));
    expect(result.current).toBe(0);
    // 예상시간만큼 경과 → 상당히 차오르지만 상한(cap=0.95) 미만.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const mid = result.current;
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.95);
    // 예상시간을 크게 초과해도 계속 전진하지만 여전히 1 미만.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBeGreaterThan(mid);
    expect(result.current).toBeLessThan(1);
  });

  it("완료(active false 전환) 시 100%로 스냅한 뒤 리셋한다", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useFakeProgress(active, 1000),
      { initialProps: { active: true } },
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBeGreaterThan(0);
    // 완료로 전환 → 즉시 1(100%).
    rerender({ active: false });
    expect(result.current).toBe(1);
    // 여운 후 0으로 리셋.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current).toBe(0);
  });
});
