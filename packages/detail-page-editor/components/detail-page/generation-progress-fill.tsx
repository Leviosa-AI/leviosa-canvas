"use client";

/**
 * 어두운(bg-le-ink-900) 생성 버튼 위에 얹는 가짜 프로그레스 오버레이.
 *
 * 진행 신호를 두 겹으로 준다: (1) 버튼 전체를 은은하게 채우는 반투명 면,
 * (2) 하단의 또렷한 3px 바. 둘 다 왼→오로 자라며, 라벨(퍼센트 포함)은 버튼이
 * 직접 그린다. 부모 버튼은 `relative overflow-hidden`이어야 한다.
 *
 * 진행률 계산은 {@link useFakeProgress}가, 표시는 이 컴포넌트가 담당한다.
 */
export function GenerationProgressFill({ progress }: { progress: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 bg-le-surface/10"
        style={{ width: `${pct}%`, transition: "width 200ms ease-out" }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-le-surface/25"
      >
        <span
          className="block h-full bg-le-surface"
          style={{ width: `${pct}%`, transition: "width 200ms ease-out" }}
        />
      </span>
    </>
  );
}

/** 진행률(0~1)을 정수 퍼센트(0~100)로. 라벨에 "42%"처럼 붙일 때 사용. */
export function progressPercent(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}

/**
 * 밝은 배경 패널(카피·SVG 프롬프트 편집)의 하단에 얹는 얇은 프로그레스 라인.
 * 색은 AI 표식 토큰(`le-ai`)이다 — 이 선이 도는 동안 일어나는 일이 생성이기
 * 때문이다. 부모는 `relative`여야 하며, 이 요소는 컨테이너 하단에 절대배치된다.
 */
export function GenerationProgressLine({ progress }: { progress: number }) {
  const pct = progressPercent(progress);
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-le-ai/15"
    >
      <span
        className="block h-full bg-le-ai"
        style={{ width: `${pct}%`, transition: "width 200ms ease-out" }}
      />
    </span>
  );
}
