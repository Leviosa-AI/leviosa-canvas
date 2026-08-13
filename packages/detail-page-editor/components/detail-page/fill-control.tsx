"use client";

import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ColorInput } from "../cardnews/color-input";

/**
 * 단색/그라데이션 겸용 채우기 컨트롤.
 *
 * 스톡 편집기는 gradient를 별도 필드가 아니라 ``fill``(또는 page ``background``)에 CSS
 * ``linear-gradient(...)`` 문자열로 담는다(``useColor``가 렌더 시 Konva의
 * fillLinearGradient*로 자동 변환). 우리 기본 ``ColorInput``은 hex 전용이라 gradient를
 * 검게 뭉갠다 → 여기서 단색/그라데이션을 토글하고, 그라데이션이면 색 stop들(2개 이상, 각
 * stop은 색+위치%) + 각도로 문자열을 만들어 같은 ``onChange``로 넘긴다. 텍스트 fill, 도형
 * fill, 페이지 배경 어디에나 재사용 가능.
 *
 * ⚠️스톡 편집기는 ``linear-gradient``만 지원한다(``utils/gradient.js`` isGradient가
 * "linear-gradient"만 검사, radial은 이미지 URL로 오인돼 렌더가 깨진다). 그래서 radial은
 * 노출하지 않는다. 대신 stop은 N개까지(colorStops 전부 매핑) 지원한다.
 */

export function isGradientValue(v: string): boolean {
  return typeof v === "string" && v.indexOf("linear-gradient") >= 0;
}

export type GradientStop = { color: string; pos: number };
export type ParsedStops = { angle: number; stops: GradientStop[] };
export type ParsedGradient = { angle: number; from: string; to: string };

const COLOR_RE = /#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/;

/** 최상위 콤마로만 자른다(rgb(...)/rgba(...) 안의 콤마는 보존). */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * ``linear-gradient(90deg, #f00 0%, #00f 50%, #0f0 100%)`` → {angle, stops}. 각도가
 * 없으면 180(CSS 기본). stop 위치가 없으면 균등 분배. stop이 2개 미만이면 보정한다.
 */
export function parseStops(v: string): ParsedStops | null {
  if (!isGradientValue(v)) return null;
  const open = v.indexOf("(");
  const close = v.lastIndexOf(")");
  if (open < 0 || close < 0) return null;
  const segs = splitTopLevel(v.slice(open + 1, close));
  if (segs.length === 0) return null;

  let angle = 180;
  let rest = segs;
  // 첫 세그먼트에 색이 없으면 각도(또는 방향) 지정으로 본다.
  if (!COLOR_RE.test(segs[0])) {
    const m = segs[0].match(/(-?\d+(?:\.\d+)?)\s*deg/);
    angle = m ? Number(m[1]) : 180;
    rest = segs.slice(1);
  }

  const stops: GradientStop[] = [];
  rest.forEach((seg, i) => {
    const cm = seg.match(COLOR_RE);
    if (!cm) return;
    const color = cm[0];
    const after = seg.slice((cm.index ?? 0) + color.length);
    const pm = after.match(/(-?\d+(?:\.\d+)?)\s*%/);
    const pos = pm
      ? Number(pm[1])
      : rest.length > 1
        ? (i / (rest.length - 1)) * 100
        : 0;
    stops.push({ color, pos });
  });

  if (stops.length === 0) return null;
  if (stops.length === 1) stops.push({ color: stops[0].color, pos: 100 });
  return { angle, stops };
}

/** {angle, stops} → 스톡 편집기가 이해하는 ``linear-gradient`` 문자열. */
export function buildStops(g: ParsedStops): string {
  const parts = g.stops
    .map((s) => `${s.color} ${Math.round(clampPos(s.pos))}%`)
    .join(", ");
  return `linear-gradient(${g.angle}deg, ${parts})`;
}

function clampPos(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// ── from/to 편의 래퍼(기존 호출부·테스트 호환) ────────────────────────────────

/** 첫 stop과 끝 stop 색만 뽑는 2-stop 뷰. */
export function parseGradient(v: string): ParsedGradient | null {
  const g = parseStops(v);
  if (!g) return null;
  return { angle: g.angle, from: g.stops[0].color, to: g.stops[g.stops.length - 1].color };
}

/** 2-stop {angle, from, to} → 문자열(0%/100%). */
export function buildGradient(g: ParsedGradient): string {
  return `linear-gradient(${g.angle}deg, ${g.from} 0%, ${g.to} 100%)`;
}

export function FillControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation("branding");
  const parsed = parseStops(value);
  const isGradient = parsed != null;
  // 단색일 때 표시/편집할 색. 그라데이션이면 첫 stop 색을 단색 후보로 쓴다.
  const solid = isGradient ? parsed.stops[0].color : value || "#000000";
  const g: ParsedStops = parsed ?? {
    angle: 180,
    stops: [
      { color: solid, pos: 0 },
      { color: "#ffffff", pos: 100 },
    ],
  };

  const emit = (next: ParsedStops) => onChange(buildStops(next));
  const setStop = (i: number, patch: Partial<GradientStop>) =>
    emit({ ...g, stops: g.stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const addStop = () => {
    // 마지막 두 stop 사이 중간에 새 stop을 끼운다.
    const last = g.stops[g.stops.length - 1];
    const prev = g.stops[g.stops.length - 2] ?? last;
    const mid = Math.round((prev.pos + last.pos) / 2);
    const stops = [
      ...g.stops.slice(0, g.stops.length - 1),
      { color: last.color, pos: mid },
      last,
    ];
    emit({ ...g, stops });
  };
  const removeStop = (i: number) => {
    if (g.stops.length <= 2) return;
    emit({ ...g, stops: g.stops.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="flex flex-col gap-2">
      {/* 단색 / 그라데이션 토글 */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => onChange(solid)}
          className={
            !isGradient
              ? "h-8 rounded-dpe-md bg-dpe-ink-900 text-xs font-dpe-semibold text-dpe-on-accent"
              : "h-8 rounded-dpe-md border border-dpe-ink-200 text-xs font-dpe-medium text-dpe-ink-600 hover:bg-dpe-ink-50"
          }
        >
          {t("detailPage.properties.fillSolid")}
        </button>
        <button
          type="button"
          onClick={() => emit(g)}
          className={
            isGradient
              ? "h-8 rounded-dpe-md bg-dpe-ink-900 text-xs font-dpe-semibold text-dpe-on-accent"
              : "h-8 rounded-dpe-md border border-dpe-ink-200 text-xs font-dpe-medium text-dpe-ink-600 hover:bg-dpe-ink-50"
          }
        >
          {t("detailPage.properties.fillGradient")}
        </button>
      </div>

      {!isGradient ? (
        <ColorInput value={solid} onChange={onChange} />
      ) : (
        <div className="flex flex-col gap-2">
          {/* 미리보기 바 */}
          <div
            className="h-6 w-full rounded-dpe-md border border-dpe-ink-200"
            style={{ background: value }}
            aria-hidden="true"
          />

          {/* stop 목록 */}
          <div className="flex flex-col gap-1.5">
            {g.stops.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <ColorInput
                  value={s.color}
                  onChange={(c) => setStop(i, { color: c })}
                />
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(clampPos(s.pos))}
                    onChange={(e) => setStop(i, { pos: Number(e.target.value) })}
                    aria-label={t("detailPage.properties.gradientStopPosition")}
                    className="w-14 rounded-dpe-md border border-dpe-ink-200 px-1.5 py-1 text-xs tabular-nums focus:border-dpe-ink-400 focus:outline-none"
                  />
                  <span className="text-[11px] text-dpe-ink-400">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeStop(i)}
                  disabled={g.stops.length <= 2}
                  aria-label={t("detailPage.properties.gradientRemoveStop")}
                  className="rounded p-1 text-dpe-ink-400 hover:text-dpe-ink-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addStop}
              className="flex items-center justify-center gap-1 rounded-dpe-md border border-dashed border-dpe-ink-300 py-1.5 text-[11px] font-dpe-medium text-dpe-ink-500 hover:border-dpe-ink-400 hover:bg-dpe-ink-50"
            >
              <Plus size={12} />
              {t("detailPage.properties.gradientAddStop")}
            </button>
          </div>

          {/* 각도 */}
          <label className="flex items-center gap-3">
            <span className="w-8 shrink-0 text-[11px] text-dpe-ink-500">
              {t("detailPage.properties.gradientAngle")}
            </span>
            <input
              type="range"
              min={0}
              max={360}
              value={g.angle}
              onChange={(e) => emit({ ...g, angle: Number(e.target.value) })}
              className="min-w-0 flex-1 accent-dpe-ink-900"
            />
            <span className="w-10 text-right text-xs tabular-nums text-dpe-ink-700">
              {Math.round(g.angle)}°
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
