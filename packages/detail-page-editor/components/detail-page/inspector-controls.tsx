// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * 우측 인스펙터가 공유하는 작은 컨트롤들.
 *
 * ``detail-page-properties-panel``에 있던 것을 그대로 옮겼다. 차트 인스펙터가 같은 것을
 * 써야 하는데, 패널이 차트 인스펙터를 import하고 차트 인스펙터가 다시 패널을 import하면
 * 순환이 된다.
 */

/** 엔진 `store.history` 중 여기서 쓰는 두 개. 없는 스토어(테스트 가짜 등)면 그냥 건너뛴다. */
export type HistoryLike = {
  startTransaction?: () => void;
  endTransaction?: () => void;
};

/** 요소(또는 스토어)에서 히스토리를 찾는다. 엔진 요소는 `el.store` 를 들고 있다. */
export function historyOf(target: unknown): HistoryLike | undefined {
  const t = target as { history?: HistoryLike; store?: { history?: HistoryLike } } | null;
  return t?.history ?? t?.store?.history;
}

/** 여러 번의 set 을 undo 한 단계로 묶는다. */
export function transact(history: HistoryLike | undefined, run: () => void): void {
  history?.startTransaction?.();
  try {
    run();
  } finally {
    history?.endTransaction?.();
  }
}

// 지금 페이지 어딘가에서 포인터를 누르고 있는가. 슬라이더를 끄는 중이면 손을 뗄 때까지
// 한 제스처로 본다. 캡처 단계로 한 번만 건다(컨트롤마다 pointerdown 을 달 필요가 없다).
let pointerHeld = false;
let pointerTracked = false;
function trackPointer() {
  if (pointerTracked || typeof window === "undefined") return;
  pointerTracked = true;
  window.addEventListener("pointerdown", () => (pointerHeld = true), true);
  const release = () => (pointerHeld = false);
  window.addEventListener("pointerup", release, true);
  window.addEventListener("pointercancel", release, true);
}

trackPointer();

/** 포인터 없이 들어온 연속 변경(키보드·네이티브 색 선택 창)을 끊어 보는 간격. */
export const GESTURE_IDLE_MS = 400;

/**
 * 슬라이더·색 선택처럼 값이 연달아 들어오는 입력을 undo **한 단계**로 묶는다.
 *
 * 첫 변경에서 트랜잭션을 열고, 포인터를 누르고 있었으면 뗄 때, 아니면 잠깐 멈출 때
 * 닫는다. 언마운트되면 열린 것을 닫는다.
 * ponytail: 포인터 없는 입력은 멈춤(GESTURE_IDLE_MS)으로 끊는다 — 입력마다 시작/끝
 * 이벤트를 받게 되면 그걸로 바꾼다.
 */
export function useGestureTransaction(history: HistoryLike | undefined) {
  const historyRef = useRef(history);
  historyRef.current = history;
  const open = useRef<HistoryLike | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const end = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    const h = open.current;
    open.current = null;
    h?.endTransaction?.();
  }, []);

  const change = useCallback(
    (run: () => void) => {
      if (!open.current) {
        const h = historyRef.current ?? {};
        h.startTransaction?.();
        open.current = h;
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
      }
      run();
      if (timer.current) clearTimeout(timer.current);
      timer.current = pointerHeld ? null : setTimeout(end, GESTURE_IDLE_MS);
    },
    [end],
  );

  useEffect(() => end, [end]);
  return { change, end };
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    // `data-le-section` 은 모바일 하단 띠가 섹션을 탭으로 세우는 손잡이다(mobile-editor-bars).
    <section
      data-le-section={title}
      className="border-t border-le-ink-200 px-4 py-3 first:border-t-0"
    >
      <h4 className="mb-2 text-[11px] font-le-semibold uppercase tracking-[0.06em] text-le-ink-400">
        {title}
      </h4>
      {children}
    </section>
  );
}

/** Numeric field: no native spinners, commits on blur/Enter, arrow-key stepping. */
export function NumberField({
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  label,
  ariaLabel,
  history,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  // 지정하면 이 라벨이 피그마식 드래그 스크럽 핸들이 된다(좌우 드래그로 값 증감).
  label?: string;
  /** 보이는 라벨이 없을 때 스크린리더용 이름. */
  ariaLabel?: string;
  /** 주면 스크럽 드래그 한 번이 undo 한 단계가 된다. */
  history?: HistoryLike;
}) {
  const { t } = useTranslation("branding");
  const id = useId();
  const gesture = useGestureTransaction(history);
  const [local, setLocal] = useState(String(value));
  useEffect(() => {
    setLocal(String(Math.round(value * 100) / 100));
  }, [value]);

  const clamp = (n: number) =>
    Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
  const precision = String(step).split(".")[1]?.length ?? 0;
  const round = (n: number) => Number(clamp(n).toFixed(precision));
  const commit = () => {
    const n = Number(local);
    if (local !== "" && !Number.isNaN(n)) onChange(clamp(n));
    else setLocal(String(value));
  };
  const stepBy = (dir: number) => {
    const base = Number(local);
    const rounded = round((Number.isNaN(base) ? value : base) + dir * step);
    setLocal(String(rounded));
    onChange(rounded);
  };

  // 드래그 스크럽: 라벨을 누른 채 좌우로 끌면 1px당 step, Shift는 ×10.
  const drag = useRef<{ x: number; base: number; moved: boolean } | null>(null);
  const onScrubDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const base = Number(local);
    drag.current = {
      x: e.clientX,
      base: Number.isNaN(base) ? value : base,
      moved: false,
    };
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* 캡처 미지원 환경 */
    }
  };
  const onScrubMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 2) return;
    d.moved = true;
    const next = round(d.base + dx * step * (e.shiftKey ? 10 : 1));
    setLocal(String(next));
    gesture.change(() => onChange(next));
  };
  const onScrubUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    gesture.end();
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* capture 이미 해제됨 */
    }
  };

  return (
    <div className="flex items-center rounded-le-md border border-le-ink-200 bg-le-surface pr-2 focus-within:border-le-ink-400">
      {label ? (
        <label
          htmlFor={id}
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubUp}
          onPointerCancel={onScrubUp}
          className="cursor-ew-resize select-none touch-none whitespace-nowrap py-1.5 pl-2 pr-1.5 text-xs font-le-medium text-le-ink-400 hover:text-le-ink-600"
          title={t("detailPage.properties.scrubHint", { label })}
        >
          {label}
        </label>
      ) : (
        <span className="pl-2" />
      )}
      <input
        id={id}
        aria-label={label ? undefined : ariaLabel}
        type="text"
        inputMode="decimal"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            stepBy(1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            stepBy(-1);
          }
        }}
        className="w-full min-w-0 bg-transparent py-1.5 text-sm tabular-nums text-le-ink-900 outline-none"
      />
      {suffix ? <span className="ml-1 text-xs text-le-ink-400">{suffix}</span> : null}
    </div>
  );
}

export function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={[
        "flex h-8 flex-1 items-center justify-center rounded-le-md border transition-colors",
        active
          ? "border-le-ink-800 bg-le-ink-900 text-le-on-accent"
          : "border-le-ink-200 bg-le-surface text-le-ink-600 hover:bg-le-ink-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
