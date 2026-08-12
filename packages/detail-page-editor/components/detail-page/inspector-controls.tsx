"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 우측 인스펙터가 공유하는 작은 컨트롤들.
 *
 * ``detail-page-properties-panel``에 있던 것을 그대로 옮겼다. 차트 인스펙터가 같은 것을
 * 써야 하는데, 패널이 차트 인스펙터를 import하고 차트 인스펙터가 다시 패널을 import하면
 * 순환이 된다.
 */

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-neutral-200 px-4 py-3 first:border-t-0">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
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
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  // 지정하면 이 라벨이 피그마식 드래그 스크럽 핸들이 된다(좌우 드래그로 값 증감).
  label?: string;
}) {
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
    onChange(next);
  };
  const onScrubUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* capture 이미 해제됨 */
    }
  };

  return (
    <div className="flex items-center rounded-md border border-neutral-200 bg-white pr-2 focus-within:border-neutral-400">
      {label ? (
        <span
          aria-hidden="true"
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubUp}
          onPointerCancel={onScrubUp}
          className="cursor-ew-resize select-none touch-none py-1.5 pl-2 pr-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-600"
          title={`${label} — 좌우로 드래그해 값 조절 (Shift ×10)`}
        >
          {label}
        </span>
      ) : (
        <span className="pl-2" />
      )}
      <input
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
        className="w-full min-w-0 bg-transparent py-1.5 text-sm tabular-nums text-neutral-900 outline-none"
      />
      {suffix ? <span className="ml-1 text-xs text-neutral-400">{suffix}</span> : null}
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
      onClick={onClick}
      className={[
        "flex h-8 flex-1 items-center justify-center rounded-md border transition-colors",
        active
          ? "border-neutral-800 bg-neutral-900 text-white"
          : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
