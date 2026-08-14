import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REVEAL_INITIAL,
  nextRevealCount,
  useProgressiveReveal,
} from "../use-progressive-reveal";

/** 감시자를 손으로 굴린다 — jsdom 에는 IntersectionObserver 가 없다. */
class FakeObserver {
  static live: FakeObserver[] = [];
  callback: IntersectionObserverCallback;
  nodes: Element[] = [];
  disconnected = false;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeObserver.live.push(this);
  }
  observe(node: Element) {
    this.nodes.push(node);
  }
  disconnect() {
    this.disconnected = true;
  }
  /** 바닥이 보였다고 알린다. */
  fire() {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  static latest() {
    const alive = FakeObserver.live.filter((o) => !o.disconnected);
    return alive[alive.length - 1];
  }
}

function install() {
  FakeObserver.live = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function Harness({ total, resetKey }: { total: number; resetKey?: unknown }) {
  const reveal = useProgressiveReveal(total, { resetKey });
  return (
    <div>
      <span data-testid="visible">{reveal.visible}</span>
      {reveal.hasMore && <div data-testid="sentinel" ref={reveal.sentinelRef} />}
    </div>
  );
}

describe("nextRevealCount", () => {
  it("전체를 넘지 않는다", () => {
    expect(nextRevealCount(12, 200, 12)).toBe(24);
    expect(nextRevealCount(196, 200, 12)).toBe(200);
    expect(nextRevealCount(200, 200, 12)).toBe(200);
  });
});

describe("useProgressiveReveal", () => {
  it("처음엔 한 화면 분량만 그린다", () => {
    install();
    const view = render(<Harness total={200} />);
    // 200장이 있어도 12장. 이 숫자가 곧 처음 나가는 이미지 요청 수다.
    expect(view.getByTestId("visible").textContent).toBe(String(REVEAL_INITIAL));
    expect(view.getByTestId("sentinel")).toBeTruthy();
  });

  it("바닥이 보이면 조금씩 늘어난다", () => {
    install();
    const view = render(<Harness total={200} />);
    act(() => FakeObserver.latest().fire());
    expect(view.getByTestId("visible").textContent).toBe("24");
    act(() => FakeObserver.latest().fire());
    expect(view.getByTestId("visible").textContent).toBe("36");
  });

  it("늘어난 뒤에도 감시자를 다시 붙인다", () => {
    // 이걸 빼먹으면 한 번 늘리고 멈춘다. IntersectionObserver 는 계속 보이는 동안
    // 다시 부르지 않아서, 짧은 목록에서는 영영 나머지가 안 나온다.
    install();
    render(<Harness total={200} />);
    const first = FakeObserver.latest();
    act(() => first.fire());
    const second = FakeObserver.latest();
    expect(first.disconnected).toBe(true);
    expect(second).not.toBe(first);
  });

  it("다 드러나면 감시자를 걷는다", () => {
    install();
    const view = render(<Harness total={14} />);
    act(() => FakeObserver.latest().fire());
    expect(view.getByTestId("visible").textContent).toBe("14");
    expect(view.queryByTestId("sentinel")).toBeNull();
  });

  it("브랜드를 옮기면 처음부터 다시 센다", () => {
    install();
    const view = render(<Harness total={200} resetKey="brand-a" />);
    act(() => FakeObserver.latest().fire());
    expect(view.getByTestId("visible").textContent).toBe("24");
    view.rerender(<Harness total={200} resetKey="brand-b" />);
    expect(view.getByTestId("visible").textContent).toBe(String(REVEAL_INITIAL));
  });

  it("갈아탄 렌더가 옛 숫자를 한 번도 내지 않는다", () => {
    // effect 로 미루면 갈아탄 직후 한 프레임 동안 새 목록에 옛 숫자가 걸려, 열두 장만
    // 보자고 나눈 목록이 그 프레임에 스물넷을 굽는다.
    install();
    const seen: number[] = [];
    function Recorder({ resetKey }: { resetKey: string }) {
      const reveal = useProgressiveReveal(200, { resetKey });
      seen.push(reveal.visible);
      return reveal.hasMore ? <div ref={reveal.sentinelRef} /> : null;
    }
    const view = render(<Recorder resetKey="brand-a" />);
    act(() => FakeObserver.latest().fire());
    expect(seen).toContain(24);

    seen.length = 0;
    view.rerender(<Recorder resetKey="brand-b" />);

    expect(seen).not.toContain(24);
    expect(seen.at(-1)).toBe(REVEAL_INITIAL);
  });

  it("감시자가 없는 환경에서는 다 그린다", () => {
    // 스크롤해도 안 나오는 것보다는 다 그리는 편이 낫다.
    FakeObserver.live = [];
    vi.stubGlobal("IntersectionObserver", undefined);
    const view = render(<Harness total={40} />);
    expect(view.getByTestId("visible").textContent).toBe("40");
  });
});
