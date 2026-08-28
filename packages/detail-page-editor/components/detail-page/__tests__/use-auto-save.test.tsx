import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";

import { useAutoSave, type SaveReason } from "../use-auto-save";

/** 스토어 대신 변경 알림만 흉내 낸다. */
function changeSource() {
  const listeners = new Set<() => void>();
  return {
    on(_event: "change", listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    fire() {
      for (const listener of [...listeners]) listener();
    },
  };
}

function mount(store: ReturnType<typeof changeSource>, save: (r: SaveReason) => Promise<void>) {
  function Probe() {
    useAutoSave({ store, delayMs: 100, save });
    return null;
  }
  return render(<Probe />);
}

describe("useAutoSave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("잠잠해진 뒤 한 번만 저장한다", async () => {
    const store = changeSource();
    const save = vi.fn(async () => {});
    mount(store, save);

    act(() => {
      store.fire();
      store.fire();
      store.fire();
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("auto");
  });

  it("저장 중에 또 바뀌면 끝난 뒤 한 번 더 보낸다", async () => {
    const store = changeSource();
    let release: (() => void) | null = null;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    mount(store, save);

    act(() => store.fire());
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(save).toHaveBeenCalledTimes(1);

    // 보내는 동안의 변경은 디바운스를 다시 돌리지만 요청은 겹치지 않는다.
    act(() => store.fire());
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.();
    });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("실패하면 다음 변경에 다시 보낸다", async () => {
    const store = changeSource();
    const save = vi
      .fn<(reason: SaveReason) => Promise<void>>()
      .mockRejectedValueOnce(new Error("망함"))
      .mockResolvedValue(undefined);
    mount(store, save);

    act(() => store.fire());
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(save).toHaveBeenCalledTimes(1);

    act(() => store.fire());
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("편집기를 떠나면 기다리지 않고 보낸다", async () => {
    const store = changeSource();
    const save = vi.fn(async () => {});
    const view = mount(store, save);

    act(() => store.fire());
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      view.unmount();
    });
    expect(save).toHaveBeenCalledWith("leave");
  });

  it("바뀐 게 없으면 떠나도 안 보낸다", async () => {
    const store = changeSource();
    const save = vi.fn(async () => {});
    const view = mount(store, save);

    await act(async () => {
      view.unmount();
    });
    expect(save).not.toHaveBeenCalled();
  });
});
