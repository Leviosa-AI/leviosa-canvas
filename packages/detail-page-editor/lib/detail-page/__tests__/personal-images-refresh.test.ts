import { describe, expect, it, vi } from "vitest";

import {
  notifyPersonalImagesChanged,
  onPersonalImagesChanged,
} from "../personal-images-refresh";

describe("personal-images-refresh 이벤트 버스", () => {
  it("구독한 리스너를 notify가 호출한다", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = onPersonalImagesChanged(a);
    const offB = onPersonalImagesChanged(b);
    notifyPersonalImagesChanged();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it("구독 해제하면 더 이상 호출되지 않는다", () => {
    const fn = vi.fn();
    const off = onPersonalImagesChanged(fn);
    off();
    notifyPersonalImagesChanged();
    expect(fn).not.toHaveBeenCalled();
  });

  it("한 리스너가 던져도 다른 리스너는 호출된다", () => {
    const boom = vi.fn(() => {
      throw new Error("listener error");
    });
    const ok = vi.fn();
    const off1 = onPersonalImagesChanged(boom);
    const off2 = onPersonalImagesChanged(ok);
    expect(() => notifyPersonalImagesChanged()).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
    off1();
    off2();
  });
});
