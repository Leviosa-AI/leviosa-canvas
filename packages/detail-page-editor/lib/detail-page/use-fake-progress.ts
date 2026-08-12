"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 긴 AI 생성(이미지·GIF·카피)이 진행되는 동안 "체감상" 진행률을 보여주는 가짜
 * 프로그레스 훅.
 *
 * 백엔드는 실제 진행률을 스트리밍하지 않으므로(폴링만), 대략적인 예상 소요시간을
 * 근거로 감속 곡선을 그려 준다. 핵심 규칙:
 *  - 초반엔 빠르게 차오르고 끝으로 갈수록 느려진다(지수 감쇠) — "멈춘 것 같은"
 *    구간을 최소화하고, 예상보다 오래 걸려도 계속 야금야금 전진해 신뢰를 준다.
 *  - 완료 전에는 절대 100%에 닿지 않는다(상한 `cap`). 100%에서 오래 머무는 건
 *    가짜 티가 가장 많이 나는 안티패턴이라 피한다.
 *  - 완료(`active`가 true→false)되는 순간에만 1(100%)로 스냅한 뒤, 짧은 여운 후
 *    0으로 리셋한다.
 *
 * 반환값은 0~1. `estimateMs`는 그 작업의 대략적 소요시간(초과해도 안전).
 */
export function useFakeProgress(
  active: boolean,
  estimateMs: number,
  opts?: { cap?: number; tickMs?: number },
): number {
  const cap = opts?.cap ?? 0.95;
  const tickMs = opts?.tickMs ?? 120;
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    // 새 실행 시작: 타임스탬프 고정 후 0부터.
    startRef.current = Date.now();
    setProgress(0);
    const id = window.setInterval(() => {
      const start = startRef.current;
      if (start == null) return;
      const elapsed = Date.now() - start;
      // r=경과/예상. displayed = cap*(1-e^{-2.2r}) → r=1에서 ~0.85cap, 이후 cap로 수렴.
      const r = elapsed / Math.max(1, estimateMs);
      const next = cap * (1 - Math.exp(-2.2 * r));
      setProgress((prev) => (next > prev ? next : prev));
    }, tickMs);
    return () => window.clearInterval(id);
  }, [active, estimateMs, cap, tickMs]);

  useEffect(() => {
    if (active) return;
    // 완료: 100%로 잠깐 채우고 여운 후 리셋(다음 실행 대비).
    startRef.current = null;
    setProgress((prev) => (prev > 0 ? 1 : 0));
    const id = window.setTimeout(() => setProgress(0), 500);
    return () => window.clearTimeout(id);
  }, [active]);

  return progress;
}

/** 상세페이지 생성 종류별 대략 예상 소요시간(ms). 실측 기반의 여유 있는 값. */
export const GENERATION_ESTIMATE_MS = {
  /** gpt-image 계열 이미지 1장(티어 무관 여유값). */
  image: 35_000,
  /** wan i2v GIF: 예측 22s + 다운로드·인코딩·폴링 오버헤드(콜드 포함). */
  gif: 75_000,
  /** 카피/텍스트·프롬프트 편집(LLM 1회 왕복). */
  text: 15_000,
} as const;
