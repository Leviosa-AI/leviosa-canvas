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
import { FrameDragGrip } from "./frame-drag-grip";
import { FrameDragLayer } from "./frame-drag-layer";
import { GifAnimator } from "./gif-animator";
import { GroupDrillIn } from "./group-drill-in";
import { HoverHighlightOverlay } from "./hover-highlight-overlay";
import { CanvasSectionHeightHandle } from "./section-height-handle";
import { loadEditorFont } from "../../lib/detail-page-canvas/editor-fonts";
import { ZoomButtons } from "@leviosa-ai/canvas";
import { CanvasView } from "@leviosa-ai/canvas/render/canvas-view";
import { frameOf, groupFrames } from "@leviosa-ai/canvas/render/frames";
import {
  DetailPageFrameHeader,
  FRAME_HEAD_HEIGHT,
} from "./detail-page-frame-header";
import { useCanvasVersion } from "@leviosa-ai/canvas/use-canvas";
import type { CanvasStore } from "@leviosa-ai/canvas/store";

const MIN_SCALE = 0.05;
const MAX_SCALE = 5;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/**
 * 벌 사이 거리 — **판 좌표**로 잰다.
 *
 * 화면 px 로 고정하면 확대했을 때는 붙어 보이고 축소했을 때는 벌어져 보인다. 판
 * 하나가 1080 인 캐러셀에서 이 값은 판의 4분의 1쯤이라, 어느 배율에서 보든 «저건
 * 다른 벌»이 한눈에 잡힌다.
 */
const FRAME_GAP_DOC = 240;

/**
 * 벌 위의 줄이 설 자리(화면 px).
 *
 * 그 줄은 흰 판 **밖**, 회색 바닥 위에 앉는다 — 작업물을 안 가리는 자리이고 피그마가
 * 프레임 이름을 두는 자리다. 대신 작업 영역 위쪽에 그만큼을 비워 둬야 한다. 안 그러면
 * 스크롤 영역 바깥으로 잘려서 아예 안 보인다(실제로 그렇게 사라져 있었다).
 */
const FRAME_HEAD = FRAME_HEAD_HEIGHT + 6;

/** 썸네일 해상도. 페이지 패널의 칸이 작아 이 정도면 충분하다. */
const THUMB_PIXEL_RATIO = 0.12;

/** 아래 띠가 가장자리·화면 목록에서 떨어지는 거리. */
const DOCK_GAP = 16;

export function LeviosaCanvasWorkspace({
  store,
  gap = 4,
  paddingX = 16,
  backgroundColor = "rgb(241, 241, 241)",
  chosenFrame,
  onChooseFrame,
  children,
}: {
  store: CanvasStore;
  gap?: number;
  paddingX?: number;
  backgroundColor?: string;
  /** 결과물이 될 벌. 내려받기·발행이 향하는 곳이다. */
  chosenFrame?: string;
  /** 안 주면 체크박스를 안 그린다 — 고를 것이 없는 문서도 있다. */
  onChooseFrame?: (frameKey: string) => void;
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
    // 프레임이 여럿이면 **열 전체**가 가로로 들어와야 한다 — 한 벌만 보이면
    // 나란히 놓은 뜻이 없다. 세로는 여전히 한 장 기준이다: 시안 하나가 스무
    // 장이 넘는 상세페이지에서 기둥 전체를 넣으면 아무것도 안 읽힌다.
    const frames = groupFrames(store.pages);
    const spread =
      frames.length > 1
        ? frames.reduce(
            (sum, frame) =>
              sum + Math.max(1, ...frame.pages.map((one) => one.width)),
            0,
          ) +
          (frames.length - 1) * FRAME_GAP_DOC
        : page.width;
    const next = clamp(
      Math.min(usableW / spread, usableH / page.height) * 0.94,
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
    // 화면 한가운데를 **점으로** 잡는다. 열이 하나뿐이던 때는 세로만 봐도 답이
    // 하나였지만, 열이 여럿이면 그 높이를 지나는 페이지가 열 수만큼 나온다 —
    // 세로만 보면 언제나 맨 왼쪽 열이 이겨서 다른 벌을 고를 수가 없다.
    const frame = inner.getBoundingClientRect();
    const cx = frame.left + inner.clientWidth / 2;
    const cy = frame.top + inner.clientHeight / 2;
    const nodes = Array.from(
      inner.querySelectorAll<HTMLElement>("[data-lc-page]"),
    );
    const distance = (node: HTMLElement) => {
      const box = node.getBoundingClientRect();
      const dx = Math.max(box.left - cx, 0, cx - box.right);
      const dy = Math.max(box.top - cy, 0, cy - box.bottom);
      return dx * dx + dy * dy;
    };
    // 가운데를 품은 페이지는 거리가 0이라 그대로 이긴다. 아무것도 안 품으면
    // (확대해서 빈 자리를 보고 있을 때) 제일 가까운 것으로 떨어진다.
    const hit = nodes.reduce<HTMLElement | undefined>(
      (best, node) =>
        !best || distance(node) < distance(best) ? node : best,
      undefined,
    );
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
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  const dirtyThumbnailIds = useRef(new Set<string>());
  const [thumbnailRevision, setThumbnailRevision] = useState(0);

  // 요소 속성 변경은 page.version을 올리지 않는다. 문서 변경 알림에서 현재 페이지만
  // 더럽다고 적어 두고, 패널이 열려 있을 때만 아래 굽기 작업을 깨운다.
  useEffect(
    () =>
      store.on("change", () => {
        const id = store.activePage?.id;
        if (id) dirtyThumbnailIds.current.add(id);
        if (panelOpenRef.current) setThumbnailRevision((value) => value + 1);
      }),
    [store],
  );

  useEffect(() => {
    if (!panelOpen) return;
    let cancelled = false;
    // 타이핑·드래그 중 매 프레임 다시 굽지 않고, 손을 잠깐 놓았을 때 바뀐 페이지만 굽는다.
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const page of store.pages) {
          if (cancelled) return;
          if (
            !dirtyThumbnailIds.current.has(page.id) &&
            detailPageThumbnailBus.has(store, page.id)
          ) {
            continue;
          }
          try {
            const uri = await store.toDataURL({
              pageId: page.id,
              pixelRatio: THUMB_PIXEL_RATIO,
            });
            if (cancelled) return;
            dirtyThumbnailIds.current.delete(page.id);
            detailPageThumbnailBus.set(store, page.id, uri);
          } catch {
            // 못 구운 페이지는 다음에 다시 시도한다(패널을 다시 열면 온다).
          }
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [panelOpen, pageIds, store, thumbnailRevision]);

  const frameCount = groupFrames(store.pages).length;
  // 보고 있는 벌 — 활성 페이지가 속한 벌이다. 목록·아래 띠가 보는 것과 같다.
  const activeFrame = frameOf(store.activePage ?? store.pages[0] ?? {});

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
            target.closest("[data-lc-page]") ||
            target.closest("[data-dp-quicktoolbar]")
          ) {
            return;
          }
          store.selectElements([]);
          // 판 밖이어도 벌의 빈 자리를 눌렀으면 그 벌로 간다 — 이름표를 없앴으니
          // 여기가 «저 벌을 보겠다»고 말하는 유일한 자리다.
          const key = target.closest<HTMLElement>("[data-lc-frame]")?.dataset
            .lcFrame;
          if (key === undefined) return;
          const first = store.pages.find((page) => frameOf(page) === key);
          if (first) store.selectPage(first.id);
        }}
        style={{
          position: "absolute",
          inset: 0,
          // 프레임이 하나뿐이면 예전 그대로다. 가운데 정렬은 내용이 넘칠 때
          // 왼쪽으로 스크롤을 못 하게 만드는 자리라, 열이 여럿일 때는 왼쪽에
          // 붙여 놓고 가로 스크롤을 연다.
          overflowX: frameCount > 1 ? "auto" : "hidden",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: frameCount > 1 ? "flex-start" : "center",
          padding: `${frameCount > 1 ? gap + FRAME_HEAD : gap}px ${paddingX}px ${gap}px`,
        }}
      >
        <CanvasView
          store={store}
          scale={scale}
          gap={gap}
          // 열이 여럿이면 가운데 정렬을 정렬 속성이 아니라 자동 여백으로 준다 —
          // 축소해서 남는 자리가 생겨도 가운데를 지키고, 커져도 스크롤이 산다.
          center={frameCount > 1}
          // 손잡이는 판 상자 **안**에 산다. 밖에서 자리를 재어 띄우면 손이 다가가는
          // 동안 «판 밖»을 지나며 깜빡인다.
          renderPageChrome={
            frameCount > 1 ? (id) => <FrameDragGrip pageId={id} /> : undefined
          }
          frameGap={FRAME_GAP_DOC * scale}
          renderFrameHeader={(key) => (
            <DetailPageFrameHeader
              chosen={key === chosenFrame}
              selected={key === activeFrame}
              onChoose={onChooseFrame ? () => onChooseFrame(key) : undefined}
            />
          )}
          frameStyle={(key) => ({
            padding: 8,
            borderRadius: 10,
            // 회색 바닥 위의 **흰 판** — 피그마의 프레임이 그렇다. 판을 얹을 자리가
            // 밝아야 «저기서 저기까지가 한 벌»이 읽힌다.
            background: "#ffffff",
            border: `1px solid ${key === activeFrame ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.10)"}`,
            // 선명한 것은 «쓸모 있는 것»이다 — 보고 있거나, 결과물이 될 것.
            opacity: key === activeFrame || key === chosenFrame ? 1 : 0.55,
            transition: "opacity 0.15s ease, border-color 0.15s ease",
          })}
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
      {/* 판을 다른 벌로 끌어오는 층. 무대마다 캔버스가 따로라, 끌리는 동안 보이는
          것은 무대가 아니라 그 위에 뜬 이 층이 그린다. */}
      <FrameDragLayer store={store} containerRef={outerRef} />
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
