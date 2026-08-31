"use client";

/**
 * 이 장의 아래 끝을 잡아 끌어 높이를 바꾸는 손잡이 — 두 엔진 공용.
 *
 * 상세페이지 한 장은 세로로 이어 붙는 띠라서 길이 자체가 편집 대상이다. 우측 패널의
 * 숫자·'내용에 맞추기'는 두 엔진이 이미 같은 함수를 쓰지만(`section-height.ts`),
 * 손잡이는 **붙일 자리**가 엔진마다 달랐다:
 *
 *  - Canvas 워크스페이스는 장마다 슬롯 `<div>`를 직접 만든다 → 그 안에 넣으면 끝.
 *  - 우리 엔진은 `CanvasView` 하나가 장 전부를 그린다 → 넣을 자리가 없다. 그래서
 *    캔버스 쪽은 다른 오버레이들과 같은 방식으로(`[data-lc-page]`의 상자를 재서)
 *    활성 장 위에 자리를 잡아 준다.
 *
 * 손잡이 자체는 한 벌이다. 두 벌로 두면 한쪽만 고쳐진다.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";

import { observer } from "./canvas-observer";
import { detailPageEditorProfile } from "../../lib/detail-page/editor-profile";
import {
  applySectionHeight,
  type SectionHeightPage,
} from "../../lib/detail-page/section-height";

export type HeightPageLike = SectionHeightPage & { id: string };

type HistoryLike = {
  startTransaction?: () => void;
  endTransaction?: () => void;
};

/**
 * 손잡이 하나. **자리를 잡아 주는 건 부모다** — `position: relative` 인 조상 아래
 * 놓이면 그 상자의 아래 끝에 붙는다.
 *
 * 끄는 동안은 히스토리 트랜잭션으로 묶는다. 안 묶으면 마우스를 한 번 끄는 사이 수십 개의
 * 되돌리기 단계가 쌓여 ⌘Z 를 스무 번 눌러야 원래 높이로 돌아간다.
 */
export const SectionHeightHandle = observer(function SectionHeightHandle({
  page,
  scale,
  history,
}: {
  page: HeightPageLike;
  /** 지금 배율. 화면 px 이동을 페이지 px 로 옮기는 데 쓴다. */
  scale: number;
  history?: HistoryLike;
}) {
  const { t } = useTranslation("branding");
  const drag = useRef<{ pointerId: number; y: number; base: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const height = Math.round(Number(page.computedHeight) || 0);

  const begin = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Konva 가 이 누름을 보면 캔버스 빈 곳 클릭으로 읽어 선택을 풀어 버린다.
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    history?.startTransaction?.();
    drag.current = { pointerId: e.pointerId, y: e.clientY, base: height };
    setDragging(true);
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.preventDefault();
    // 화면 px → 페이지 px. 축소해서 보고 있으면 1px 을 끌어도 페이지는 더 많이 움직인다.
    const dy = (e.clientY - d.y) / Math.max(scale || 1, 0.01);
    applySectionHeight(page, d.base + dy);
  };

  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    setDragging(false);
    history?.endTransaction?.();
  };

  return (
    <div
      data-dp-section-height-handle=""
      role="separator"
      aria-orientation="horizontal"
      aria-label={t("detailPage.properties.pageHeight")}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      style={{
        position: "absolute",
        left: "50%",
        bottom: -7,
        transform: "translateX(-50%)",
        width: 64,
        height: 14,
        zIndex: 20,
        cursor: "ns-resize",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        touchAction: "none",
        // 캔버스 쪽에서는 이 손잡이를 이벤트가 안 통하는 상자 안에 넣는다.
        pointerEvents: "auto",
      }}
    >
      {/* 흰 알약 + 테두리. 예전에는 반투명 회색 막대 하나였는데, 사진이나 어두운
          배경으로 끝나는 장 밑에서는 배경에 묻혀 «없어진» 것처럼 보였다. */}
      <div
        style={{
          width: dragging ? 64 : 48,
          height: 10,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: dragging ? "rgb(139, 92, 246)" : "rgba(255,255,255,0.96)",
          border: dragging ? "none" : "1px solid rgba(23,23,23,0.18)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
          transition: "width 120ms ease, background 120ms ease",
        }}
      >
        <div
          style={{
            width: 22,
            height: 2,
            borderRadius: 999,
            background: dragging
              ? "rgba(255,255,255,0.9)"
              : "rgba(23,23,23,0.45)",
          }}
        />
      </div>
      {dragging ? (
        <span
          style={{
            position: "absolute",
            top: 16,
            padding: "2px 7px",
            borderRadius: 6,
            background: "rgb(23,23,23)",
            color: "#fff",
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {height}px
        </span>
      ) : null}
    </div>
  );
});
SectionHeightHandle.displayName = "SectionHeightHandle";

type CanvasStoreLike = {
  scale?: number;
  activePage?: HeightPageLike;
  history?: HistoryLike;
};

type Box = { left: number; top: number; width: number; height: number };

function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

/**
 * 우리 엔진 위에서 손잡이의 자리를 잡아 준다.
 *
 * 엔진이 그린 장의 상자(`[data-lc-page]`)를 재서 그 위에 이벤트가 안 통하는 껍데기를
 * 겹치고, 손잡이만 그 안에서 받는다. 엔진 패키지 안에 편집기 전용 부품을 넣지 않기
 * 위한 자리다 — 다른 오버레이들(말풍선 꼬리·hover)도 같은 방식이다.
 *
 * 끄는 동안 상자가 한 프레임 늦게 따라와도 값은 안 틀어진다. 끌기 계산이 상자 자리가
 * 아니라 처음 눌렀을 때의 높이와 포인터 이동량만 쓰기 때문이다.
 */
export const CanvasSectionHeightHandle = observer(
  function CanvasSectionHeightHandle({
    store,
    containerRef,
    scrollRef,
  }: {
    store: unknown;
    containerRef: RefObject<HTMLDivElement | null>;
    scrollRef: RefObject<HTMLDivElement | null>;
  }) {
    const s = store as CanvasStoreLike;
    const page = s.activePage;
    const pageId = page?.id ?? "";
    const scale = Number(s.scale) || 1;
    const height = Math.round(Number(page?.computedHeight) || 0);
    const [box, setBox] = useState<Box | null>(null);
    const frame = useRef<number | null>(null);

    const measure = () => {
      const host = containerRef.current;
      const node = pageId
        ? host?.querySelector<HTMLElement>(
            `[data-lc-page="${CSS.escape(pageId)}"]`,
          )
        : null;
      const next: Box | null =
        host && node
          ? (() => {
              const r = node.getBoundingClientRect();
              const h = host.getBoundingClientRect();
              return {
                left: r.left - h.left,
                top: r.top - h.top,
                width: r.width,
                height: r.height,
              };
            })()
          : null;
      // 같은 값이면 그대로 둔다 — 끄는 동안 매 프레임 새 객체를 넣으면 공짜 리렌더가 쌓인다.
      setBox((prev) => (sameBox(prev, next) ? prev : next));
    };

    // 높이·배율이 바뀌면 장의 상자도 바뀐다 — 끄는 동안 손잡이가 아래 끝을 따라가야 한다.
    //
    // **두 번 잰다.** 처음 붙을 때는 그 자리에서 재도 소용이 없다 — 자식의 레이아웃
    // 이펙트가 부모의 ref 보다 먼저 돌아서 `containerRef.current` 가 아직 비어 있다
    // (다른 오버레이들이 프레임을 기다리는 이유가 이것이다). 반대로 높이가 바뀌는
    // 동안은 ref 가 이미 있으므로 그 자리에서 재야 손잡이가 한 박자 늦지 않는다.
    useLayoutEffect(() => {
      measure();
      const raf = requestAnimationFrame(measure);
      return () => cancelAnimationFrame(raf);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageId, height, scale]);

    useEffect(() => {
      if (!pageId) return;
      const scroller = scrollRef.current;
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageId, scrollRef]);

    // 캐러셀 판은 1080×1350 고정이다 — 끌 수 있는 손잡이를 두면 안 된다.
    if (detailPageEditorProfile().page.fixed) return null;
    if (!page || !box) return null;

    return (
      <div
        data-dp-section-height-frame=""
        style={{
          position: "absolute",
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          pointerEvents: "none",
          // 아래 띠(페이지 목록)와 하단 독보다 위다. 장의 아래 끝이 화면 밑쪽에
          // 오면 그것들이 손잡이를 덮어서 «없어진» 것처럼 보였다.
          zIndex: 31,
        }}
      >
        <SectionHeightHandle page={page} scale={scale} history={s.history} />
      </div>
    );
  },
);
CanvasSectionHeightHandle.displayName = "CanvasSectionHeightHandle";
