"use client";

import { useEffect, useState } from "react";

/**
 * 긴 목록을 스크롤한 만큼만 그리는 훅.
 *
 * 브랜드 자산 서랍은 목록을 통째로 그렸다. 항목 하나가 곧 `<img>` 하나라 브랜드에
 * 쌓인 사진이 수백 장이면 패널을 여는 순간 그만큼의 요청이 한꺼번에 나갔다. 편집기가
 * 정작 필요한 것(문서 이미지·폰트)을 그 뒤에 줄 세우는 셈이다.
 *
 * 그래서 처음엔 한 화면 분량만 그리고, 바닥에 둔 감시자가 보일 때마다 조금씩 늘린다.
 *
 * **다 드러난 뒤에도 감시를 붙여 두면 안 된다.** 그리고 늘어난 뒤에는 감시자를 다시
 * 붙여야 한다 — IntersectionObserver 는 "보이는 상태가 바뀔 때" 부르지, 계속 보이는
 * 동안 다시 부르지 않는다. 짧은 목록에서 감시자가 화면에 남아 있으면 한 번 늘리고
 * 멈춰 버린다. 아래 effect 가 `count` 마다 감시자를 새로 만드는 이유다.
 */

export const REVEAL_INITIAL = 12;
export const REVEAL_STEP = 12;

/** 다음에 몇 개까지 보일지. 전체를 넘지 않는다. */
export function nextRevealCount(
  current: number,
  total: number,
  step: number = REVEAL_STEP,
): number {
  return Math.min(total, current + Math.max(1, step));
}

export interface ProgressiveReveal {
  /** 지금 그려야 할 개수. `items.slice(0, visible)`. */
  visible: number;
  /** 목록 바닥에 둘 감시자. 더 없으면 그리지 않는다. */
  sentinelRef: (node: HTMLElement | null) => void;
  hasMore: boolean;
}

export function useProgressiveReveal(
  total: number,
  opts?: { initial?: number; step?: number; resetKey?: unknown },
): ProgressiveReveal {
  const initial = opts?.initial ?? REVEAL_INITIAL;
  const step = opts?.step ?? REVEAL_STEP;
  const resetKey = opts?.resetKey;
  const [count, setCount] = useState(initial);
  const [node, setNode] = useState<HTMLElement | null>(null);

  // 목록이 갈아끼워지면(브랜드 전환·갈래 전환·새로고침) 다시 처음부터 센다. 안 그러면
  // 200장을 보고 온 사람이 다른 목록으로 옮겨도 200장을 그대로 요청한다.
  //
  // effect 가 아니라 **렌더 중에** 되돌린다. effect 로 미루면 갈아탄 직후 한 프레임
  // 동안 새 목록에 옛 숫자가 걸려, 열두 장만 보자고 나눈 목록이 그 프레임에 스물넷을
  // 굽는다. 되돌릴 값이 렌더에 이미 있는데 그림을 한 번 내보낼 이유가 없다.
  const [lastResetKey, setLastResetKey] = useState<unknown>(resetKey);
  const [lastInitial, setLastInitial] = useState(initial);
  // 되돌린 값은 이번 렌더가 바로 쓴다. `count` 는 다음 렌더에나 바뀌므로, 이걸
  // 안 두면 되돌리기로 해 놓고 정작 이번 렌더는 옛 숫자를 내보낸다.
  let revealed = count;
  if (!Object.is(lastResetKey, resetKey) || lastInitial !== initial) {
    setLastResetKey(resetKey);
    setLastInitial(initial);
    setCount(initial);
    revealed = initial;
  }

  useEffect(() => {
    if (!node || count >= total) return;
    // 서버 렌더나 옛 브라우저처럼 감시자가 없는 곳에서는 그냥 다 그린다 — 안 그리면
    // 스크롤해도 영영 안 나온다.
    if (typeof IntersectionObserver === "undefined") {
      setCount(total);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setCount((current) => nextRevealCount(current, total, step));
        }
      },
      // 바닥에 닿기 전에 미리 굽는다 — 스크롤이 빈칸에 부딪히지 않게.
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, count, total, step]);

  return {
    visible: Math.min(revealed, total),
    sentinelRef: setNode,
    hasMore: revealed < total,
  };
}
