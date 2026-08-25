"use client";

/**
 * 고른 것 바로 위에 뜨는 띠.
 *
 * 자르기·배경 지우기·프롬프트로 편집처럼 **그 요소에만 해당하는 일**을 손이 있는 자리에
 * 둔다. 지금까지는 전부 우측 패널 아래쪽에 있어서, 캔버스에서 고르고 → 눈을 오른쪽 끝으로
 * 옮기고 → 스크롤해 찾는 왕복이 매번 붙었다.
 *
 * 무엇을 띄울지는 여기서 안 정한다(`canvas-selection-tools.tsx`가 정한다) — 이 파일은
 * **자리 잡기**만 한다. 자리는 선택 상자를 실제로 재서 잡되, 위가 좁으면 아래로 내려가고
 * 작업 영역 밖으로는 안 나간다.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { elementClientRect, unionRect, type ClientRect } from "./element-rects";
import type { SelectableElement } from "./detail-page-selection";

export type QuickToolbarItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** 눌린 상태(예: 열려 있는 팝오버의 주인). */
  active?: boolean;
  /** 이 항목 **앞에** 구분선을 긋는다. */
  separated?: boolean;
};

/** 선택 상자와 띠 사이의 여백(px). */
const GAP = 10;
const EDGE = 8;
/** 띠의 대략 높이. 실측 전 첫 프레임에만 쓴다. */
const BAR_HEIGHT = 40;
/** 띠와 그 아래(또는 위) 창 사이의 여백(px). 클래스의 `mt-1.5`/`mb-1.5`와 같은 값이다. */
const POPOVER_GAP = 6;
/** 창이 이보다 낮아지면 접힌 것과 다름없다 — 스스로 스크롤하게 두고 이 높이는 지킨다. */
const POPOVER_MIN = 200;

/**
 * 띠의 자리. 위가 모자라면 아래로 뒤집고, 좌우는 작업 영역 안으로 민다.
 *
 * 좌표는 전부 작업 영역(host) 기준이다.
 */
export function toolbarPosition(
  anchor: { left: number; top: number; right: number; bottom: number },
  host: { width: number; height: number },
  size: { width: number; height: number },
): { left: number; top: number } {
  const above = anchor.top - GAP - size.height;
  const below = anchor.bottom + GAP;
  const top = above >= EDGE ? above : Math.min(below, host.height - size.height - EDGE);
  const centred = (anchor.left + anchor.right) / 2 - size.width / 2;
  return {
    left: Math.max(EDGE, Math.min(centred, host.width - size.width - EDGE)),
    top: Math.max(EDGE, top),
  };
}

/**
 * 창이 띠의 위에 설지 아래에 설지, 그리고 얼마나 높을 수 있는지.
 *
 * 자리 계산이 재는 것은 **띠**뿐이라(`size`가 `barRef` 것이다) 창은 지금까지 아무에게도
 * 안 물어보고 띠 아래로 흘렀다. 상세페이지 사진은 대개 한 섹션을 통째로 덮어서 띠가
 * 작업 영역 맨 아래에 붙는데, 그러면 창은 통째로 화면 밖에 그려진다 — 열려 있고,
 * 접근성 트리에도 있고, 눈에는 없다. 그 자리에서는 위로 뒤집는다.
 */
export function popoverPlacement(
  barTop: number,
  barHeight: number,
  hostHeight: number,
): { side: "above" | "below"; maxHeight: number } {
  const below = hostHeight - (barTop + barHeight) - POPOVER_GAP - EDGE;
  const above = barTop - POPOVER_GAP - EDGE;
  const side = below >= above ? "below" : "above";
  return {
    side,
    maxHeight: Math.max(POPOVER_MIN, side === "below" ? below : above),
  };
}

export type QuickPopoverPlacement = ReturnType<typeof popoverPlacement>;

const QuickPopoverContext = createContext<QuickPopoverPlacement>({
  side: "below",
  maxHeight: 520,
});

/** 창을 그리는 쪽이 자기 자리를 집는 곳. 띠 밖에서 부르면 기본값(아래)이다. */
export function useQuickPopoverPlacement(): QuickPopoverPlacement {
  return useContext(QuickPopoverContext);
}

export function SelectionQuickToolbar({
  els,
  items,
  containerRef,
  scrollRef,
  children,
}: {
  /** 띠가 따라다닐 요소들. 비면 안 뜬다. */
  els: SelectableElement[];
  items: QuickToolbarItem[];
  containerRef: RefObject<HTMLElement | null>;
  scrollRef?: RefObject<HTMLElement | null>;
  /** 띠 아래에 붙는 것(열린 팝오버). 자리 계산은 띠가 하고 내용은 바깥이 준다. */
  children?: ReactNode;
}) {
  const [anchor, setAnchor] = useState<ClientRect | null>(null);
  const [size, setSize] = useState({ width: 0, height: BAR_HEIGHT });
  // 끄는 동안에는 숨는다 — 손 밑에서 띠가 같이 움직이면 무엇을 옮기는지 안 보인다.
  const [dragging, setDragging] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  const key = els.map((el) => el.id).join(",");

  const measure = useCallback(() => {
    const host = containerRef.current;
    if (!host || !els.length) {
      setAnchor(null);
      return;
    }
    const union = unionRect(els.map((el) => elementClientRect(el)));
    if (!union) {
      setAnchor(null);
      return;
    }
    const box = host.getBoundingClientRect();
    setAnchor({
      left: union.left - box.left,
      top: union.top - box.top,
      right: union.right - box.left,
      bottom: union.bottom - box.top,
    });
    // 선택이 바뀔 때마다 다시 잰다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, key]);

  // 캔버스가 이 선택으로 다시 그려진 뒤에 잰다.
  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      measure();
      requestAnimationFrame(measure);
    });
    return () => cancelAnimationFrame(raf);
  }, [measure, items.length]);

  useEffect(() => {
    if (!key) return;
    const scroller = scrollRef?.current;
    const onMove = () => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        measure();
      });
    };
    scroller?.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      scroller?.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [key, measure, scrollRef]);

  // 캔버스를 누르고 있는 동안(끌기·크기 조절) 숨겼다가, 손을 떼면 새 자리에서 다시 뜬다.
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const down = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-dp-quick-toolbar]")) return;
      setDragging(true);
    };
    const up = () => {
      setDragging(false);
      measure();
    };
    host.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      host.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, [containerRef, measure]);

  useLayoutEffect(() => {
    const node = barRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    setSize((prev) =>
      prev.width === box.width && prev.height === box.height
        ? prev
        : { width: box.width, height: box.height },
    );
  }, [items, anchor]);

  if (!anchor || !items.length || dragging) return null;
  const host = containerRef.current;
  if (!host) return null;

  const { left, top } = toolbarPosition(
    anchor,
    { width: host.clientWidth, height: host.clientHeight },
    size,
  );
  const placement = popoverPlacement(top, size.height, host.clientHeight);

  return (
    <div
      data-dp-quick-toolbar=""
      style={{ position: "absolute", left, top, zIndex: 35 }}
    >
      <div
        ref={barRef}
        className="flex items-center gap-0.5 rounded-dpe-xl border border-dpe-ink-200 bg-dpe-surface/95 px-1 py-1 shadow-md backdrop-blur-sm"
      >
        {items.map((item) => (
          <div key={item.key} className="flex items-center">
            {item.separated ? (
              <span className="mx-1 h-5 w-px bg-dpe-ink-200" aria-hidden="true" />
            ) : null}
            <button
              type="button"
              data-dp-quick-action={item.key}
              title={item.label}
              aria-label={item.label}
              aria-pressed={item.active ?? undefined}
              disabled={item.disabled}
              onClick={item.onClick}
              className={[
                "flex h-8 items-center gap-1.5 rounded-dpe-lg px-2 text-[13px] font-dpe-medium transition-colors",
                item.disabled
                  ? "cursor-not-allowed text-dpe-ink-300"
                  : item.active
                    ? "bg-dpe-ink-100 text-dpe-ink-900"
                    : "text-dpe-ink-700 hover:bg-dpe-ink-100 hover:text-dpe-ink-900",
              ].join(" ")}
            >
              {item.icon}
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          </div>
        ))}
      </div>
      <QuickPopoverContext.Provider value={placement}>
        {children}
      </QuickPopoverContext.Provider>
    </div>
  );
}
