// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";

import { useAutoSave, type AutoSave, type SaveReason } from "../use-auto-save";

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

function mount(
  store: ReturnType<typeof changeSource>,
  save: (r: SaveReason) => Promise<void>,
  extra: {
    onError?: (error: unknown, reason: SaveReason) => void;
    retry?: (error: unknown) => boolean;
    delayMs?: number;
  } = {},
) {
  const handle: { current: AutoSave | null } = { current: null };
  function Probe() {
    handle.current = useAutoSave({ store, delayMs: 100, save, ...extra });
    return null;
  }
  return { ...render(<Probe />), handle };
}

function beforeUnload(): Event {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event;
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

  it("손을 안 떼고 계속 그려도 상한에서 한 번 내보낸다", async () => {
    const store = changeSource();
    const save = vi.fn(async () => {});
    mount(store, save);

    // 디바운스(100ms)보다 촘촘히 계속 바꾼다 — 상한이 없으면 영영 안 나간다.
    for (let elapsed = 0; elapsed < 15_000; elapsed += 50) {
      act(() => store.fire());
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
    }
    // 상한이 없으면 0번이다. 몇 번인지는 상한 값에 달렸으니 범위로 잡는다 — 매 변경마다
    // 나가는 것(=디바운스가 죽은 것)도 여기서 걸린다.
    expect(save.mock.calls.length).toBeGreaterThan(0);
    expect(save.mock.calls.length).toBeLessThan(6);
    expect(save).toHaveBeenCalledWith("auto");
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

  it("실패하면 알리고 2·4·8초 뒤 세 번까지 다시 보낸다", async () => {
    const store = changeSource();
    const save = vi.fn(async () => {
      throw new Error("망함");
    });
    const onError = vi.fn();
    mount(store, save, { onError });

    act(() => store.fire());
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(save).toHaveBeenCalledTimes(1);
    // 연속 실패의 첫 번째만 알린다 — 재시도마다 토스트가 쌓이면 소음이다.
    expect(onError).toHaveBeenCalledTimes(1);

    for (const [wait, calls] of [
      [2_000, 2],
      [4_000, 3],
      [8_000, 4],
    ] as const) {
      await act(async () => {
        vi.advanceTimersByTime(wait - 1);
      });
      expect(save).toHaveBeenCalledTimes(calls - 1);
      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(save).toHaveBeenCalledTimes(calls);
    }
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(save).toHaveBeenCalledTimes(4);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("그 사이 저장이 성공하면 재시도를 접는다", async () => {
    const store = changeSource();
    const save = vi
      .fn<(reason: SaveReason) => Promise<void>>()
      .mockRejectedValueOnce(new Error("망함"))
      .mockResolvedValue(undefined);
    const { handle } = mount(store, save);

    act(() => store.fire());
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      await handle.current?.flush("manual");
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(handle.current?.dirty).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("다시 보낼 가치가 없는 실패(충돌)는 재시도 없이 dirty 로 남긴다", async () => {
    const store = changeSource();
    const save = vi.fn(async () => {
      throw Object.assign(new Error("충돌"), { conflict: true });
    });
    const onError = vi.fn();
    const { handle } = mount(store, save, { onError, retry: () => false });

    act(() => store.fire());
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(handle.current?.dirty).toBe(true);
  });

  it("저장 버튼은 자동저장과 같은 줄에 선다 — 겹치지 않고, 끝나면 dirty 가 풀린다", async () => {
    const store = changeSource();
    let release: (() => void) | null = null;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const { handle } = mount(store, save);

    act(() => store.fire());
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(save).toHaveBeenCalledTimes(1);

    let manual: Promise<boolean> | undefined;
    act(() => {
      manual = handle.current?.flush("manual");
    });
    // 보내는 중에는 두 번째 요청이 안 나간다.
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("manual");
    await act(async () => {
      release?.();
      expect(await manual).toBe(true);
    });
    expect(handle.current?.dirty).toBe(false);
  });

  it("자동저장을 안 켜도 dirty 를 세고 저장 버튼은 동작한다", async () => {
    const store = changeSource();
    const save = vi.fn(async () => {});
    const { handle } = mount(store, save, { delayMs: undefined });

    act(() => store.fire());
    expect(handle.current?.dirty).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await handle.current?.flush("manual");
    });
    expect(save).toHaveBeenCalledWith("manual");
    expect(handle.current?.dirty).toBe(false);
  });

  it("변경이 남아 있으면 창을 닫을 때 붙잡는다", async () => {
    const store = changeSource();
    const save = vi.fn(async () => {});
    mount(store, save);

    expect(beforeUnload().defaultPrevented).toBe(false);
    act(() => store.fire());
    expect(beforeUnload().defaultPrevented).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(beforeUnload().defaultPrevented).toBe(false);
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
