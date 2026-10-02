// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
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
import {
  getFrameInsert,
  subscribeFrameInsert,
} from "./frame-drag-bus";
import { FrameDragLayer } from "./frame-drag-layer";
import { GifAnimator } from "./gif-animator";
import { GroupDrillIn } from "./group-drill-in";
import { useIsMobile } from "./mobile-editor-bars";
import { HoverHighlightOverlay } from "./hover-highlight-overlay";
import { CanvasSectionHeightHandle } from "./section-height-handle";
import { loadEditorFont } from "../../lib/detail-page-canvas/editor-fonts";
import {
  CANVAS_CLIPBOARD_MARK,
  imageFiles,
  insertImageFiles,
  planPaste,
} from "../../lib/detail-page/canvas-paste";
import { useOptionalDetailPageHost } from "./detail-page-host-context";
import { insertText, TEXT_SIZE_PRESETS } from "./detail-page-text-panel";
import { pasteElements } from "@leviosa-ai/canvas/edit/commands";
import { useTranslation } from "react-i18next";
import { ZoomButtons } from "@leviosa-ai/canvas";
import { CanvasView } from "@leviosa-ai/canvas/render/canvas-view";
import {
  frameOf,
  frameVanished,
  groupFrames,
} from "@leviosa-ai/canvas/render/frames";
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

/**
 * 핀치를 붙잡은 자리 — 손가락 가운데 아래 있던 판과, 그 판 안의 문서 좌표.
 *
 * 스크롤 양으로 셈하지 않고 판의 실제 자리(DOM)로 맞춘다. 판 둘레 여백과 가운데 정렬은
 * 배율 따라 안 늘어나서, 스크롤로 비례 계산하면 수십 px 씩 밀린다.
 */
type PinchAnchor = {
  page: HTMLElement;
  docX: number;
  docY: number;
  clientX: number;
  clientY: number;
};

/** 관성 스크롤 한 걸음: 속도(px/ms)를 dt(ms)만큼 마찰로 줄인다. 충분히 느려지면 0. */
export function flingStep(velocity: number, dt: number): number {
  const next = velocity * Math.pow(0.997, dt);
  return Math.abs(next) < 0.02 ? 0 : next;
}

export function LeviosaCanvasWorkspace({
  store,
  gap = 4,
  paddingX = 16,
  backgroundColor = "rgb(241, 241, 241)",
  chosenFrame,
  onChooseFrame,
  children,
  uploadFile,
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
  /** 끌어다 놓거나 붙여넣은 그림을 올린다. 없으면 그림 드롭·붙여넣기를 안 받는다. */
  uploadFile?: (file: File) => Promise<string>;
}) {
  useCanvasVersion(store);
  const { t } = useTranslation("branding");
  const toast = useOptionalDetailPageHost()?.toast;
  const uploadRef = useRef(uploadFile);
  uploadRef.current = uploadFile;
  const insertFiles = useCallback(
    (files: File[]) => {
      const upload = uploadRef.current;
      if (!upload || !files.length) return;
      void insertImageFiles(store, files, upload).catch(() =>
        toast?.error(t("detailPage.photos.uploadFailed")),
      );
    },
    [store, t, toast],
  );

  // OS 클립보드 붙여넣기(다른 앱의 그림·글자). 무엇을 붙일지는 `canvas-paste` 가 고른다.
  useEffect(() => {
    let fallback: ReturnType<typeof setTimeout> | null = null;
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return (
        !!el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.code !== "KeyV") return;
      if (event.altKey || event.shiftKey || typing()) return;
      // 엔진의 ⌘V 는 기본 동작을 막아서 `paste` 이벤트가 안 뜬다. 엔진에 안 넘기고
      // 브라우저가 `paste` 를 띄우게 둔다.
      event.stopPropagation();
      // `paste` 를 안 띄우는 환경도 있다 — 그때는 엔진 붙여넣기로 돌아간다.
      if (fallback) clearTimeout(fallback);
      fallback = setTimeout(() => {
        fallback = null;
        pasteElements(store);
      }, 50);
    };
    const onPaste = (event: ClipboardEvent) => {
      if (typing()) return;
      if (fallback) {
        clearTimeout(fallback);
        fallback = null;
      }
      event.preventDefault();
      const plan = planPaste(event.clipboardData, Boolean(uploadRef.current));
      if (plan.kind === "engine") pasteElements(store);
      else if (plan.kind === "files") insertFiles(plan.files);
      else insertText(store, plan.text, TEXT_SIZE_PRESETS[2]);
    };
    // 요소를 복사하면 브라우저 `copy` 이벤트에도 표식을 적는다. `markCanvasCopy` 의
    // writeText 는 권한·제스처 문제로 조용히 실패할 수 있고, 그러면 ⌘V 가 옛 OS 글자를
    // 붙인다 — 이 경로는 권한이 필요 없다. 글자를 고르고 있을 때는 그 글자가 복사돼야 한다.
    const onCopy = (event: ClipboardEvent) => {
      if (typing() || !event.clipboardData) return;
      if (!store.selectedElementsIds.length) return;
      event.clipboardData.setData("text/plain", CANVAS_CLIPBOARD_MARK);
      event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("paste", onPaste);
    window.addEventListener("copy", onCopy);
    return () => {
      if (fallback) clearTimeout(fallback);
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("copy", onCopy);
    };
  }, [store, insertFiles]);
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [panning, setPanning] = useState(false);
  const pan = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
    /** 손을 뗄 때 관성으로 넘길 속도(px/ms) — 최근 움직임에 가중을 둔다. */
    vx: number;
    vy: number;
    lastX: number;
    lastY: number;
    at: number;
  } | null>(null);
  const fling = useRef(0);
  const stopFling = useCallback(() => {
    cancelAnimationFrame(fling.current);
    fling.current = 0;
  }, []);
  useEffect(() => stopFling, [stopFling]);
  const startFling = (el: HTMLElement, vx: number, vy: number) => {
    // rAF 시각은 프레임 시작 시각이라 performance.now() 보다 이를 수 있다 — 첫 프레임을
    // 기준으로 잡고, 탭이 멈췄다 깨어난 긴 간격은 한 프레임 남짓으로 자른다.
    let last: number | null = null;
    const step = (now: number) => {
      const dt = last === null ? 16 : Math.min(64, Math.max(0, now - last));
      last = now;
      vx = flingStep(vx, dt);
      vy = flingStep(vy, dt);
      if (!vx && !vy) return void (fling.current = 0);
      el.scrollLeft += vx * dt;
      el.scrollTop += vy * dt;
      fling.current = requestAnimationFrame(step);
    };
    fling.current = requestAnimationFrame(step);
  };
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
  const mobile = useIsMobile();
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
    // 폰에서는 지금 보는 판 하나의 **폭**에 맞춘다. 높이까지 넣으면 긴 상세페이지가
    // 10%대로 쪼그라들어 글자를 못 읽는다 — 아래는 손가락으로 내려 보면 된다.
    const next = clamp(
      mobile
        ? // 벌이 여럿이면 판이 흰 바탕(안쪽 여백 8 + 테두리 1)에 싸여 있다.
          (usableW - (frames.length > 1 ? 18 : 0)) / page.width
        : Math.min(usableW / spread, usableH / page.height) * 0.94,
      MIN_SCALE,
      MAX_SCALE,
    );
    fittedScale.current = next;
    setScale(next);
  }, [viewport, paddingX, gap, store, setScale, mobile]);

  // ⌘/ctrl+휠(맥 트랙패드 핀치가 이 모양으로 온다)로 커서 자리를 붙잡고 확대.
  // 그냥 휠은 브라우저 스크롤 그대로 둔다.
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const onWheel = (event: WheelEvent) => {
      stopFling();
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
  }, [store, stopFling]);

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    pan.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: event.currentTarget.scrollLeft,
      top: event.currentTarget.scrollTop,
      vx: 0,
      vy: 0,
      lastX: event.clientX,
      lastY: event.clientY,
      at: event.timeStamp,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPanning(true);
    event.preventDefault();
  };

  // 두 손가락: 벌린 만큼 확대하고, 두 손가락 가운데를 따라 화면을 옮긴다. 두 번째
  // 손가락이 닿는 순간부터 캔버스(요소 끌기·Konva)에는 아무것도 안 보낸다 — 첫 손가락이
  // 요소를 집고 있었으면 그 자리에서 멈춘다.
  const pinching = useRef<{ distance: number; scale: number } | null>(null);
  const anchor = useRef<PinchAnchor | null>(null);
  // 붙잡은 문서 좌표가 손가락 가운데 아래 오도록 스크롤을 옮긴다. 배율이 바뀌었으면
  // 새 크기가 그려진 직후(레이아웃 효과)에 한다 — 먼저 하면 옛 크기에 잘린다.
  const settleAnchor = useCallback(() => {
    const inner = innerRef.current;
    const at = anchor.current;
    if (!inner || !at) return;
    const rect = at.page.getBoundingClientRect();
    inner.scrollLeft += rect.left + at.docX * store.scale - at.clientX;
    inner.scrollTop += rect.top + at.docY * store.scale - at.clientY;
  }, [store]);
  useLayoutEffect(() => {
    if (pinching.current) settleAnchor();
  }, [scale, settleAnchor]);
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const points = (event: TouchEvent) => {
      const [a, b] = [event.touches[0], event.touches[1]];
      return {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      };
    };
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      event.stopPropagation();
      const at = points(event);
      const page =
        document.elementFromPoint(at.x, at.y)?.closest<HTMLElement>("[data-lc-page]") ??
        inner.querySelector<HTMLElement>("[data-lc-page]");
      pan.current = null;
      setPanning(false);
      pinching.current = { distance: at.distance, scale: store.scale };
      if (!page) return;
      const rect = page.getBoundingClientRect();
      anchor.current = {
        page,
        docX: (at.x - rect.left) / store.scale,
        docY: (at.y - rect.top) / store.scale,
        clientX: at.x,
        clientY: at.y,
      };
    };
    const onMove = (event: TouchEvent) => {
      const start = pinching.current;
      if (!start) return;
      event.stopPropagation();
      event.preventDefault();
      if (event.touches.length < 2) return;
      const at = points(event);
      if (anchor.current) {
        anchor.current.clientX = at.x;
        anchor.current.clientY = at.y;
      }
      const next = clamp(
        start.scale * (at.distance / Math.max(1, start.distance)),
        MIN_SCALE,
        MAX_SCALE,
      );
      if (next !== store.scale) store.setScale(next);
      else settleAnchor();
    };
    const onEnd = (event: TouchEvent) => {
      // 끝 이벤트는 흘려보낸다 — Konva 가 window 에서 받아 진행 중이던 드래그를 닫는다.
      if (!pinching.current) return;
      if (event.touches.length === 0) {
        pinching.current = null;
        anchor.current = null;
      }
    };
    // 캡처로 건다 — 캔버스(안쪽)보다 먼저 받아야 끊을 수 있다.
    const opts = { capture: true, passive: false } as const;
    inner.addEventListener("touchstart", onStart, opts);
    inner.addEventListener("touchmove", onMove, opts);
    inner.addEventListener("touchend", onEnd, opts);
    inner.addEventListener("touchcancel", onEnd, opts);
    // Konva 는 포인터 이벤트도 듣는다. 포인터 이벤트는 touchstart 보다 먼저 오므로
    // 두 번째 손가락은 여기서 따로 센다 — 안 그러면 그 손가락이 다른 요소를 골라 버린다.
    const down = new Set<number>();
    const blockPointer = (event: PointerEvent) => {
      if (event.type === "pointerdown") stopFling();
      if (event.pointerType !== "touch") return;
      if (event.type === "pointerdown") {
        const second = down.size > 0;
        down.add(event.pointerId);
        if (second) event.stopPropagation();
      } else if (event.type === "pointermove") {
        if (pinching.current || down.size > 1) event.stopPropagation();
      } else {
        down.delete(event.pointerId);
      }
    };
    const pointerTypes = ["pointerdown", "pointermove", "pointerup", "pointercancel"];
    for (const type of pointerTypes) inner.addEventListener(type, blockPointer as EventListener, true);
    return () => {
      inner.removeEventListener("touchstart", onStart, opts);
      inner.removeEventListener("touchmove", onMove, opts);
      inner.removeEventListener("touchend", onEnd, opts);
      inner.removeEventListener("touchcancel", onEnd, opts);
      for (const type of pointerTypes) {
        inner.removeEventListener(type, blockPointer as EventListener, true);
      }
    };
  }, [store, settleAnchor, stopFling]);

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
    // **벌은 스크롤로 안 바뀐다.** 벌을 고르는 것은 그 안을 누르는 일이지 지나가는
    // 일이 아니다 — 빈 자리를 잡아 화면을 옮겼을 뿐인데 «대표로 지정»이 다른 벌로
    // 건너뛰면 어디를 보고 있는지 알 수가 없다. 같은 벌 안에서 어느 판을 보고 있는지만
    // 따라간다. 꼬리표 없는 문서는 전부가 한 벌이라 지금까지와 똑같다.
    const current = frameOf(store.activePage ?? store.pages[0] ?? {});
    const nodes = Array.from(
      inner.querySelectorAll<HTMLElement>("[data-lc-page]"),
    ).filter((node) => {
      const page = node.dataset.lcPage
        ? store.getPageById(node.dataset.lcPage)
        : null;
      return page ? frameOf(page) === current : false;
    });
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

  /**
   * 고른 요소가 있으면 «보고 있는 벌»은 손이 가 있는 곳이지 화면 가운데가 아니다.
   *
   * 이게 없으면 4번 벌의 요소를 집는 순간 그 선택이 활성 페이지를 옮기고, 그 때문에
   * 화면이 스르륵 움직이고, 그 스크롤이 가운데에 있는 2번 벌을 다시 활성으로 만든다 —
   * 집은 것은 4번인데 «대표로 지정»은 2번 위에 뜬다.
   */
  const holding = store.selectedElementsIds.length > 0;
  /** 고른 요소가 놓인 페이지. 활성 화면이 여기로 온 것이면 손으로 누른 것이다. */
  const heldPageId =
    store.pageOfElement(store.selectedElementsIds[0] ?? "")?.id ?? null;

  const scrollRaf = useRef<number | null>(null);
  const holdingRef = useRef(holding);
  holdingRef.current = holding;
  const heldPageIdRef = useRef(heldPageId);
  heldPageIdRef.current = heldPageId;
  const onScroll = useCallback(() => {
    if (scrollRaf.current != null) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null;
      if (holdingRef.current) return;
      recomputeActive();
    });
  }, [recomputeActive]);

  // 바깥(페이지 패널의 행 클릭)에서 활성 화면이 바뀌면 그 페이지를 위로 올린다.
  const activeId = store.activePage?.id;
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || !activeId || activeId === scrollSetId.current) return;
    // 캔버스에서 요소를 집어 활성 화면이 바뀐 것이면 옮기지 않는다. 방금 손으로
    // 누른 것이라 이미 보고 있고, 여기서 화면을 움직이면 누를 때마다 밑이 흔들린다.
    // 목록에서 고른 때만 데려간다.
    if (activeId === heldPageIdRef.current) {
      scrollSetId.current = activeId;
      return;
    }
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

  const frames = groupFrames(store.pages);
  const frameCount = frames.length;

  /**
   * 벌 하나가 통째로 사라지면 **되돌릴 길을 띄운다.**
   *
   * 벌은 문서의 층이 아니라 판에 붙은 이름표라, 마지막 판을 옆 벌로 끌면 그 벌은 남을
   * 자리가 없어 사라진다. 그게 틀린 결과는 아니다 — 남은 판이 없으니 열도 없다. 문제는
   * 되돌릴 창이 짧다는 것이다: 자동저장은 이미 나갔고, 새로고침하면 되돌리기 기록이
   * 없어져 실수로 끈 벌이 영영 안 돌아온다.
   *
   * 그래서 «막는» 대신 «돌아올 길»을 둔다. 끌기 층이 아니라 여기서 보는 이유는, 지우기와
   * 끌기가 같은 자리에서 같은 결과를 내기 때문이다 — 벌이 몇 개 서 있는지는 이 화면이
   * 이미 세고 있다.
   */
  const [emptied, setEmptied] = useState(false);
  const frameKeys = frames.map((one) => one.key).join("\u0000");
  const seenFrames = useRef(frameKeys);
  useEffect(() => {
    const before = seenFrames.current.split("\u0000").filter(Boolean);
    const after = frameKeys.split("\u0000").filter(Boolean);
    seenFrames.current = frameKeys;
    if (frameVanished(before, after)) setEmptied(true);
  }, [frameKeys]);
  useEffect(() => {
    if (!emptied) return;
    const timer = window.setTimeout(() => setEmptied(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [emptied]);
  // 끼어들 자리는 끌기 층이 정하고, 빈칸은 판을 그리는 쪽이 흐름 안에 넣는다.
  const frameInsert = useSyncExternalStore(
    subscribeFrameInsert,
    getFrameInsert,
    () => null,
  );
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
      // 탐색기에서 끌어 온 그림을 받는다. 자리는 붙여넣기와 같이 활성 화면 가운데다.
      // ponytail: 놓은 좌표에 두지 않는다 — 필요하면 clientX/Y 를 판 좌표로 바꿔 넘긴다.
      onDragOver={(event) => {
        if (!uploadRef.current || !event.dataTransfer?.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        const files = imageFiles(event.dataTransfer?.files);
        if (!uploadRef.current || !files.length) return;
        event.preventDefault();
        insertFiles(files);
      }}
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
          // 손가락으로 판 위 빈 곳(또는 잠긴 배경)을 누르면 화면을 옮긴다. 캔버스가 먼저
          // 받아서 요소를 짚었으면 골랐고, 빈 곳이면 선택을 비웠다 — 그걸 보고 가른다.
          // 판 위의 터치는 브라우저 스크롤을 꺼 뒀다(touch-action) — 요소 끌기와 겹친다.
          if (
            event.pointerType === "touch" &&
            target.closest("[data-lc-page]") &&
            store.selectedElementsIds.length === 0
          ) {
            startPan(event);
            return;
          }
          if (
            target.closest("[data-lc-page]") ||
            target.closest("[data-dp-quicktoolbar]") ||
            target.closest(
              "button, a, input, textarea, select, [contenteditable='true']",
            )
          ) {
            return;
          }
          store.selectElements([]);
          // 판 밖이어도 벌의 빈 자리를 눌렀으면 그 벌로 간다 — 이름표를 없앴으니
          // 여기가 «저 벌을 보겠다»고 말하는 유일한 자리다.
          const key = target.closest<HTMLElement>("[data-lc-frame]")?.dataset
            .lcFrame;
          if (key !== undefined) {
            const first = store.pages.find((page) => frameOf(page) === key);
            if (first) store.selectPage(first.id);
          }
          if (event.button !== 0) return;
          startPan(event);
        }}
        onPointerMove={(event) => {
          const start = pan.current;
          if (!start || start.pointerId !== event.pointerId || pinching.current) return;
          event.currentTarget.scrollLeft = start.left + start.x - event.clientX;
          event.currentTarget.scrollTop = start.top + start.y - event.clientY;
          const dt = event.timeStamp - start.at;
          if (dt > 0) {
            start.vx = 0.8 * ((start.lastX - event.clientX) / dt) + 0.2 * start.vx;
            start.vy = 0.8 * ((start.lastY - event.clientY) / dt) + 0.2 * start.vy;
          }
          start.lastX = event.clientX;
          start.lastY = event.clientY;
          start.at = event.timeStamp;
        }}
        onPointerUp={(event) => {
          const start = pan.current;
          if (start?.pointerId !== event.pointerId) return;
          pan.current = null;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          setPanning(false);
          // 손가락만 관성으로 미끄러진다. 멈췄다 뗐으면(80ms 넘게 안 움직임) 그대로 선다.
          if (event.pointerType === "touch" && event.timeStamp - start.at < 80) {
            startFling(event.currentTarget, start.vx, start.vy);
          }
        }}
        onPointerCancel={(event) => {
          if (pan.current?.pointerId !== event.pointerId) return;
          pan.current = null;
          setPanning(false);
        }}
        style={{
          position: "absolute",
          inset: 0,
          // 자동 여백으로 가운데를 잡으면 확대해 넘친 뒤에도 양쪽으로 스크롤할 수 있다.
          overflowX: "auto",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          cursor: panning ? "grabbing" : "default",
          // 손가락 제스처(옮기기·핀치)는 아래에서 직접 받는다. 브라우저에 맡기면 요소
          // 끌기와 화면 스크롤이 한 손가락을 두고 다툰다.
          touchAction: "none",
          padding: `${frameCount > 1 ? gap + FRAME_HEAD : gap}px ${paddingX}px ${gap}px`,
        }}
      >
        <CanvasView
          store={store}
          scale={scale}
          gap={gap}
          // 가운데 정렬은 자동 여백으로 준다 — 축소해서 남는 자리가 생겨도 가운데를
          // 지키고, 커지면 여백이 0이 되어 좌우 스크롤이 열린다.
          center
          // 손잡이는 판 상자 **안**에 산다. 밖에서 자리를 재어 띄우면 손이 다가가는
          // 동안 «판 밖»을 지나며 깜빡인다.
          renderPageChrome={
            frameCount > 1 ? (id) => <FrameDragGrip pageId={id} /> : undefined
          }
          frameGap={FRAME_GAP_DOC * scale}
          frameInsert={frameInsert}
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
            // **흐리게 하지 않는다.** 한때 «보고 있거나 대표인 것만 선명»으로 뒀는데,
            // 이 화면은 후보를 **견주는** 자리다 — 넷 중 둘이 바래 있으면 견줄 수가
            // 없고, 판을 옮기면 색이 달라져서 옮긴 것이 변한 것처럼 보인다.
            // 무엇이 나가는지는 «대표» 표가, 무엇을 보고 있는지는 테두리가 이미 말한다.
            transition: "border-color 0.15s ease",
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

      {/* 벌 하나가 사라졌을 때의 «되돌리기». 아래 띠 위에 앉힌다 — 그 자리는 배율과
          삽입이 이미 쓰고 있어 눈이 가 있다. 열 초 뒤에 스스로 사라진다. */}
      {emptied ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 64,
            transform: "translateX(-50%)",
            zIndex: 45,
            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.25)",
          }}
          className="flex items-center gap-2 rounded-le-md bg-le-ink-900 px-3 py-2 text-[12px] text-le-on-accent"
        >
          <span>한 벌이 비어 사라졌습니다.</span>
          <button
            type="button"
            className="font-le-semibold underline underline-offset-2"
            onClick={() => {
              store.history.undo();
              setEmptied(false);
            }}
          >
            되돌리기
          </button>
        </div>
      ) : null}
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
          className="rounded-le-lg border border-le-ink-200 bg-le-surface/95 px-2 py-1 shadow-sm backdrop-blur-sm"
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
