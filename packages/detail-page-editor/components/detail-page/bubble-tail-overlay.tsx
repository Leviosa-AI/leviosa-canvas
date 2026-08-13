"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { observer } from "./canvas-observer";
import { useTranslation } from "react-i18next";

import {
  selectedElementsDeep,
  type SelectableElement,
} from "./detail-page-selection";
import { elementClientRect, type RectElement } from "./element-rects";
import {
  bubbleSvgDataUrl,
  readBubbleParams,
  type BubbleParams,
  type Pt,
} from "@leviosa-ai/canvas/paint/bubble-path";

/**
 * 말풍선 꼬리 끝점을 드래그하는 핸들 — Canva/미리캔버스식.
 *
 * 말풍선은 몸통+꼬리가 이어진 하나의 닫힌 path이고(``bubble-path.ts``), 그 생성
 * 파라미터가 ``custom.bubble``에 실려 온다(디컴포저가 ``data-bubble``에서 옮겨 담는다).
 * 그래서 편집기는 말풍선을 굳은 그림이 아니라 **다시 구울 수 있는 도형**으로 다룬다:
 * 끝점을 옮기고 path를 재생성해 ``src``에 다시 넣으면 된다.
 *
 * 꼬리는 각도가 아니라 끝점으로 잡히므로 360도 어디로 끌어도 몸통에 붙어 있고,
 * 모서리에 걸치면 두 변에 걸친 부리가 된다. 끝점을 몸통 안으로 끌면 꼬리가 사라진다.
 *
 * ``NestedSelectionOverlay``와 같은 좌표계 규약을 쓴다 — Konva 노드에서 잰 rect를
 * 컨테이너 기준으로 옮기므로 줌·스크롤·스택 워크스페이스가 그대로 동작한다.
 */

const HANDLE = 12;
const ACCENT = "#2F6FEB";

// SelectableElement(선택 모델)과 RectElement(측정 모델)의 교집합 — 두 헬퍼를 다 쓴다.
type ElementLike = SelectableElement & RectElement;

type StoreLike = {
  selectedElements?: SelectableElement[];
  selectedElementsIds?: string[];
  getElementById?: (id: string) => SelectableElement | undefined;
  scale?: number;
  history?: { startTransaction?: () => void; endTransaction?: () => void };
};

/** 몸통 로컬 좌표 → SVG 박스 안의 0..1 비율. 리사이즈돼도 비율은 그대로다. */
function tipFraction(p: BubbleParams, tip: Pt): { fx: number; fy: number } {
  return { fx: (tip[0] + p.pad) / (p.w + 2 * p.pad), fy: (tip[1] + p.pad) / (p.h + 2 * p.pad) };
}

/** 0..1 비율 → 몸통 로컬 좌표. 꼬리가 잘리지 않도록 pad 안으로 가둔다. */
function fractionToTip(p: BubbleParams, fx: number, fy: number): Pt {
  const bw = p.w + 2 * p.pad;
  const bh = p.h + 2 * p.pad;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return [
    clamp(fx * bw - p.pad, -p.pad, p.w + p.pad),
    clamp(fy * bh - p.pad, -p.pad, p.h + p.pad),
  ];
}

/** 파라미터를 갱신하고 path를 다시 구워 요소에 반영한다. */
export function applyBubble(el: ElementLike, next: BubbleParams): void {
  const custom = (el.custom && typeof el.custom === "object" ? el.custom : {}) as Record<string, unknown>;
  el.set({ src: bubbleSvgDataUrl(next), custom: { ...custom, bubble: next } });
}

/**
 * 말풍선을 리사이즈하면 몸통 크기를 파라미터에 되먹인다.
 *
 * 이게 없으면 스톡 편집기가 svg를 통째로 스케일해 모서리 라운드와 테두리 굵기까지 늘어난다
 * (가로로만 늘리면 라운드가 타원이 된다). w/h를 다시 못박고 path를 재생성하면
 * 라운드·스트로크는 원래 굵기를 유지한 채 몸통만 커진다.
 */
export function syncBubbleToBox(el: ElementLike): boolean {
  const p = readBubbleParams(el.custom);
  if (!p) return false;
  const boxW = Number(el.width);
  const boxH = Number(el.height);
  if (!Number.isFinite(boxW) || !Number.isFinite(boxH)) return false;
  const w = boxW - 2 * p.pad;
  const h = boxH - 2 * p.pad;
  if (w <= 0 || h <= 0) return false;
  if (Math.abs(w - p.w) < 0.5 && Math.abs(h - p.h) < 0.5) return false;

  // 꼬리 끝점은 몸통에 대한 비율을 유지한다 — 늘려도 꼬리가 제자리에 남는다.
  const tip: Pt | null = p.tip ? [(p.tip[0] / p.w) * w, (p.tip[1] / p.h) * h] : null;
  applyBubble(el, { ...p, w, h, tip });
  return true;
}

export const BubbleTailOverlay = observer(function BubbleTailOverlay({
  store,
  containerRef,
}: {
  store: unknown;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation("branding");
  const s = store as StoreLike;
  const [handles, setHandles] = useState<Array<{ id: string; left: number; top: number }>>([]);
  const drag = useRef<{ pointerId: number; el: ElementLike; p: BubbleParams } | null>(null);

  const selected = selectedElementsDeep(s) as ElementLike[];
  // mobx가 위치/크기 변화를 감지하도록 렌더 중에 읽는다.
  const stamp = selected.map((e) => `${e.id}:${e.x},${e.y},${e.width},${e.height}`).join("|");
  const scale = s.scale ?? 1;

  // selectedElementsDeep은 매 렌더 '새 배열'을 만든다. 그 배열을 의존성에 두면 이펙트가
  // 매 렌더 돌고, setHandles가 또 새 배열을 넣어 리렌더를 부른다 — 무한 루프
  // ("Maximum update depth exceeded"). 그래서 의존성은 내용을 요약한 stamp로만 걸고,
  // 배열 자체는 ref로 읽는다.
  const selectedRef = useRef<ElementLike[]>(selected);
  selectedRef.current = selected;
  // 계산 결과가 같으면 상태를 아예 건드리지 않는다 — 두 번째 안전장치.
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    const host = containerRef.current;
    const next: Array<{ id: string; left: number; top: number }> = [];
    if (host) {
      const box = host.getBoundingClientRect();
      for (const el of selectedRef.current) {
        // 리사이즈는 선택된 상태에서만 일어나므로 여기서 되먹이면 충분하다.
        // 멱등하다(크기가 그대로면 no-op) → 루프를 돌지 않는다.
        syncBubbleToBox(el);
        const p = readBubbleParams(el.custom);
        if (!p?.tip) continue;
        const r = elementClientRect(el);
        if (!r) continue;
        const { fx, fy } = tipFraction(p, p.tip);
        next.push({
          id: el.id,
          left: r.left - box.left + fx * (r.right - r.left),
          top: r.top - box.top + fy * (r.bottom - r.top),
        });
      }
    }
    const key = next.map((h) => `${h.id}:${h.left.toFixed(2)},${h.top.toFixed(2)}`).join("|");
    if (key === keyRef.current) return;
    keyRef.current = key;
    setHandles(next);
  }, [stamp, scale, containerRef]);

  const begin = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    const el = s.getElementById?.(id) as ElementLike | undefined;
    const p = el && readBubbleParams(el.custom);
    if (!el || !p) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, el, p };
    s.history?.startTransaction?.();
  };

  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const r = elementClientRect(d.el);
    if (!r) return;
    const w = r.right - r.left;
    const h = r.bottom - r.top;
    if (!w || !h) return;
    const fx = (e.clientX - r.left) / w;
    const fy = (e.clientY - r.top) / h;
    applyBubble(d.el, { ...d.p, tip: fractionToTip(d.p, fx, fy) });
  };

  const end = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    s.history?.endTransaction?.();
  };

  if (!handles.length) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 21 }}>
      {handles.map((h) => (
        <span
          key={h.id}
          title={t("detailPage.bubbleTail.handle")}
          onPointerDown={(e) => begin(e, h.id)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          style={{
            position: "absolute",
            left: h.left - HANDLE / 2,
            top: h.top - HANDLE / 2,
            width: HANDLE,
            height: HANDLE,
            borderRadius: "50%",
            background: "#fff",
            border: `2px solid ${ACCENT}`,
            boxSizing: "border-box",
            pointerEvents: "auto",
            cursor: "grab",
            touchAction: "none",
          }}
        />
      ))}
    </div>
  );
});
BubbleTailOverlay.displayName = "BubbleTailOverlay";
