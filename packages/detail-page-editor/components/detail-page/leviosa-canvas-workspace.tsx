"use client";

/**
 * 우리 엔진 위의 작업 영역 (G7-b).
 *
 * ``StackedCanvasWorkspace``가 하던 일을 그대로 한다 — 세로로 쌓기, 처음 한 번
 * 화면에 맞추기, ⌘/ctrl+휠 확대, 스크롤에 따라 활성 화면 바꾸기, 썸네일 굽기,
 * 그리고 캔버스 위에 얹히는 층들. 다른 점은 페이지를 **누가** 그리느냐뿐이다.
 *
 * 창(windowing)을 여기서 안 센다. 엔진의 ``CanvasView``가 페이지마다 화면 근처인지
 * 스스로 보고 Stage를 만들거나 만들지 않는다 — 슬롯 높이를 미리 계산해 인덱스로
 * 세던 예전 방식보다 정확하고, 페이지 높이가 제각각인 상세페이지에서 특히 그렇다.
 *
 * 썸네일도 DOM에서 캔버스를 긁지 않는다. 엔진의 ``store.toDataURL({pageId})``가
 * 화면 밖 페이지를 잠깐 띄워 굽고 다시 놓아준다 — 예전에 이 길을 못 쓴 이유(내보내기
 * 인스턴스가 화면의 Konva 를 못 찾는 문제)는 우리 엔진에는 없다.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { BubbleTailOverlay } from "./bubble-tail-overlay";
import { CanvasContextMenu } from "./canvas-context-menu";
import { CanvasInsertToolbar } from "./canvas-insert-toolbar";
import { CanvasOverlayHost } from "./canvas-overlay-host";
import { CanvasSelectionTools } from "./canvas-selection-tools";
import { DetailPagePageToolbar } from "./detail-page-page-toolbar";
import {
  PAGES_TIMELINE_HEIGHT,
  pagesTimelineVisible,
} from "./detail-page-pages-timeline";
import { detailPageThumbnailBus } from "./detail-page-thumbnail-bus";
import { GifAnimator } from "./gif-animator";
import { GroupDrillIn } from "./group-drill-in";
import { HoverHighlightOverlay } from "./hover-highlight-overlay";
import { CanvasSectionHeightHandle } from "./section-height-handle";
import { loadEditorFont } from "../../lib/detail-page-canvas/editor-fonts";
import { ZoomButtons } from "@leviosa-ai/canvas";
import { CanvasView } from "@leviosa-ai/canvas/render/canvas-view";
import { useCanvasVersion } from "@leviosa-ai/canvas/use-canvas";
import type { CanvasStore } from "@leviosa-ai/canvas/store";

const MIN_SCALE = 0.05;
const MAX_SCALE = 5;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** 썸네일 해상도. 페이지 패널의 칸이 작아 이 정도면 충분하다. */
const THUMB_PIXEL_RATIO = 0.12;

/** 아래 띠가 가장자리·화면 목록에서 떨어지는 거리. */
const DOCK_GAP = 16;

export function LeviosaCanvasWorkspace({
  store,
  gap = 4,
  paddingX = 16,
  backgroundColor = "rgb(241, 241, 241)",
  children,
}: {
  store: CanvasStore;
  gap?: number;
  paddingX?: number;
  backgroundColor?: string;
  /** 작업 영역 위에 얹을 것(찾기·바꾸기 같은 편집기 고유 층). */
  children?: ReactNode;
}) {
  useCanvasVersion(store);
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  // 배율은 **스토어**에 산다. 확대 버튼도, 여기 휠도 같은 자리를 만져야 한 쪽이
  // 다른 쪽을 되돌려 놓지 않는다.
  const scale = store.scale;
  const setScale = useCallback((next: number) => store.setScale(next), [store]);
  const pageIds = store.pages.map((page) => page.id).join(",");

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const apply = () =>
      setViewport({ width: el.clientWidth, height: el.clientHeight });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 첫 화면을 통째로 화면에 넣는다. 폭만 맞추면 긴 상세페이지가 화면보다 길어진다.
  //
  // **한 번만 하면 안 된다.** 편집기가 처음 뜰 때는 좌우 패널이 아직 자리를 안 잡아
  // 작업 영역이 실제보다 넓게 측정되고, 그 폭에 맞춘 배율은 패널이 들어오는 순간
  // 너무 크다(맨 처음 붙였을 때 134%가 나왔다). 그래서 **사용자가 배율을 만지기
  // 전까지는** 영역이 바뀔 때마다 다시 맞춘다. 손을 대는 순간 주인이 바뀐다.
  const fittedScale = useRef<number | null>(null);
  useEffect(() => {
    if (!viewport.width || !viewport.height || store.pages.length === 0) return;
    // 우리가 맞춰 놓은 값과 다르면 사용자가 만진 것이다.
    if (fittedScale.current !== null && store.scale !== fittedScale.current) {
      return;
    }
    const page = store.activePage ?? store.pages[0];
    const usableW = Math.max(1, viewport.width - 2 * paddingX);
    const usableH = Math.max(1, viewport.height - 2 * gap);
    const next = clamp(
      Math.min(usableW / page.width, usableH / page.height) * 0.94,
      MIN_SCALE,
      MAX_SCALE,
    );
    fittedScale.current = next;
    setScale(next);
  }, [viewport, paddingX, gap, store, setScale]);

  // ⌘/ctrl+휠(맥 트랙패드 핀치가 이 모양으로 온다)로 커서 자리를 붙잡고 확대.
  // 그냥 휠은 브라우저 스크롤 그대로 둔다.
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const current = store.scale;
      const next = clamp(
        current * (event.deltaY < 0 ? 1.08 : 1 / 1.08),
        MIN_SCALE,
        MAX_SCALE,
      );
      if (next === current) return;
      const rect = inner.getBoundingClientRect();
      const anchor = event.clientY - rect.top + inner.scrollTop;
      const ratio = next / current;
      store.setScale(next);
      requestAnimationFrame(() => {
        inner.scrollTop = anchor * ratio - (event.clientY - rect.top);
      });
    };
    inner.addEventListener("wheel", onWheel, { passive: false });
    return () => inner.removeEventListener("wheel", onWheel);
  }, [store]);

  /** 스크롤 때문에 우리가 바꾼 활성 화면 — 바깥에서 바꾼 것과 구분해 되울림을 막는다. */
  const scrollSetId = useRef<string | null>(null);

  // 화면 한가운데를 지나는 페이지가 활성 화면이다. 자리는 DOM 에서 직접 읽는다 —
  // 높이가 제각각이라 계산으로 맞추면 한 픽셀씩 어긋난다.
  const recomputeActive = useCallback(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const middle = inner.getBoundingClientRect().top + inner.clientHeight / 2;
    const nodes = Array.from(
      inner.querySelectorAll<HTMLElement>("[data-lc-page]"),
    );
    const hit =
      nodes.find((node) => {
        const box = node.getBoundingClientRect();
        return box.top <= middle && box.bottom >= middle;
      }) ?? nodes[0];
    const id = hit?.dataset.lcPage;
    if (!id || store.activePage?.id === id) return;
    scrollSetId.current = id;
    store.selectPage(id);
  }, [store]);

  const scrollRaf = useRef<number | null>(null);
  const onScroll = useCallback(() => {
    if (scrollRaf.current != null) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null;
      recomputeActive();
    });
  }, [recomputeActive]);

  // 바깥(페이지 패널의 행 클릭)에서 활성 화면이 바뀌면 그 페이지를 위로 올린다.
  const activeId = store.activePage?.id;
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || !activeId || activeId === scrollSetId.current) return;
    scrollSetId.current = activeId;
    const node = inner.querySelector<HTMLElement>(
      `[data-lc-page="${CSS.escape(activeId)}"]`,
    );
    if (!node) return;
    inner.scrollTo({
      top: inner.scrollTop + node.getBoundingClientRect().top -
        inner.getBoundingClientRect().top - gap,
      behavior: "smooth",
    });
  }, [activeId, gap]);

  // 페이지 패널을 열면 아직 없는 썸네일을 한 장씩 굽는다. 한 번에 하나씩 굽는 이유는
  // 굽는 동안 그 페이지를 화면 밖에서도 그려야 해서다 — 30장을 한꺼번에 띄우면
  // 브라우저가 멈춘다.
  const panelOpen = store.openedSidePanel === "pages";
  useEffect(() => {
    if (!panelOpen) return;
    let cancelled = false;
    void (async () => {
      for (const page of store.pages) {
        if (cancelled) return;
        if (detailPageThumbnailBus.has(page.id)) continue;
        try {
          const uri = await store.toDataURL({
            pageId: page.id,
            pixelRatio: THUMB_PIXEL_RATIO,
          });
          if (cancelled) return;
          detailPageThumbnailBus.set(page.id, uri);
        } catch {
          // 못 구운 페이지는 다음에 다시 시도한다(패널을 다시 열면 온다).
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [panelOpen, pageIds, store]);

  const pageWidth = useMemo(
    () => Math.max(1, ...store.pages.map((page) => page.width)),
    // 페이지 구성이 바뀔 때만 다시 잰다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageIds, store],
  );

  return (
    <div
      ref={outerRef}
      data-lc-workspace=""
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        outline: "none",
        backgroundColor,
        overflow: "hidden",
      }}
      tabIndex={0}
    >
      <div
        ref={innerRef}
        onScroll={onScroll}
        onPointerDown={(event) => {
          // 페이지 바깥의 빈 자리를 누르면 선택 해제. 페이지 안은 캔버스가 처리한다.
          const target = event.target as HTMLElement;
          if (
            !target.closest("[data-lc-page]") &&
            !target.closest("[data-dp-quicktoolbar]")
          ) {
            store.selectElements([]);
          }
        }}
        style={{
          position: "absolute",
          inset: 0,
          overflowX: "hidden",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: `${gap}px ${paddingX}px`,
        }}
      >
        <CanvasView
          store={store}
          scale={scale}
          gap={gap}
          interactive
          loadFont={loadEditorFont}
        />
      </div>

      {/* 표·차트 레일과 크기 되먹임. 이 둘만 스토어를 구조적 타입으로 받으므로
          얼굴을 하나 씌워 넘긴다(canvas-store-facade에 이유를 적어 뒀다). */}
      <CanvasOverlayHost store={store} containerRef={outerRef} />

      {/* 말풍선 꼬리 핸들 · 우클릭 메뉴 · 레이어 트리 hover · 그룹 파고들기 · GIF 재생.
          선택 상자와 크기 손잡이는 엔진이 직접 그린다(그룹 안 요소까지). */}
      <BubbleTailOverlay store={store} containerRef={outerRef} />
      <CanvasContextMenu store={store} containerRef={outerRef} />
      {/* 고른 것 위에 뜨는 띠(자르기·배경 지우기·프롬프트 편집·더보기)와 자르기 층. */}
      <CanvasSelectionTools
        store={store}
        containerRef={outerRef}
        scrollRef={innerRef}
      />
      <HoverHighlightOverlay
        store={store}
        containerRef={outerRef}
        scrollRef={innerRef}
      />
      <GroupDrillIn store={store} containerRef={outerRef} />
      <GifAnimator store={store} />
      {/* 활성 화면의 아래 끝을 잡아 끌어 길이를 바꾸는 손잡이. 우측 패널의 숫자와
          같은 함수를 거친다(`section-height.ts`) — 배경 요소까지 같이 늘리고 서버
          굽기 상한 안에 가둔다. */}
      <CanvasSectionHeightHandle
        store={store}
        containerRef={outerRef}
        scrollRef={innerRef}
      />

      {children}

      {/* 아래 띠 한 줄 — 가운데는 삽입(글상자·기본 도형), 오른쪽 끝은 배율. 화면 아래
          가운데는 피그마·캔바가 모두 쓰는 자리라 손이 먼저 간다.

          화면 목록(가로 띠)이 떠 있으면 그 높이만큼 위로 비킨다 — 안 그러면 두 띠가
          겹쳐서 아래 것이 안 눌린다. 높이와 표시 규칙은 그 띠가 들고 있다. */}
      <div
        data-dp-bottom-dock=""
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: pagesTimelineVisible(store)
            ? PAGES_TIMELINE_HEIGHT + DOCK_GAP
            : DOCK_GAP,
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div data-dp-insert-dock="" style={{ pointerEvents: "auto" }}>
          <CanvasInsertToolbar store={store} />
        </div>
        <div
          data-dp-zoom-dock=""
          style={{ position: "absolute", right: DOCK_GAP, pointerEvents: "auto" }}
          className="rounded-dpe-lg border border-dpe-ink-200 bg-dpe-surface/95 px-2 py-1 shadow-sm backdrop-blur-sm"
        >
          <ZoomButtons store={store} />
        </div>
      </div>

      {store.activePage ? (
        <div
          data-dp-quicktoolbar=""
          style={{
            position: "absolute",
            left: Math.min(
              viewport.width / 2 + (pageWidth * scale) / 2 + 8,
              viewport.width - 52,
            ),
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 30,
          }}
        >
          <DetailPagePageToolbar store={store} page={store.activePage} />
        </div>
      ) : null}
    </div>
  );
}
