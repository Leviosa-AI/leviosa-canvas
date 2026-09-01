"use client";

/**
 * 페이지를 세로로 쌓아 보여주는 작업 영역.
 *
 * 상세페이지는 20~30 섹션짜리 한 장이라 "슬라이드 넘기기"가 아니라 **스크롤**이 맞다.
 * 페이지마다 Stage를 따로 두는 이유는 두 가지다 — 뷰포트 밖 페이지를 통째로 안 그릴 수
 * 있고, 캔버스 하나의 픽셀 한계(20~30 × 2000px)에 걸리지 않는다.
 *
 * 확대/축소는 좌표를 곱하지 않고 Stage의 `scale`로 준다. 문서 좌표가 곧 화면 좌표라서
 * 히트 테스트·드래그·캐럿 계산이 전부 한 좌표계에서 끝난다.
 */

import "konva/lib/shapes/Line";
import "konva/lib/shapes/Transformer";

import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Line, Rect, Stage, Transformer } from "react-konva/es/ReactKonvaCore";

import { shouldWatermark } from "../license";
import { CanvasElement, type CanvasPage, type CanvasStore } from "../store";
import { num, str } from "../types";
import { elementRect, type Rect as DocRect } from "../edit/rect";
import { handleCanvasHotkey } from "../edit/hotkeys";
import {
  rectFromPoints,
  rectsOverlap,
  snapRect,
  type Guide,
} from "../edit/snap";
import { useCanvasVersion, usePageVersion, useSelectionKey } from "../use-canvas";
import { EditContext, type EditHandlers } from "./edit-context";
import { groupFrames } from "./frames";
import { ElementView } from "./element-view";
import { elementPath, isTransformerPart, type HitNode } from "./hit-path";
import {
  absorbTransform,
  applyInTransaction,
  groupResizePatches,
  pickFromPath,
  toggleSelection,
  type TransformResult,
} from "./interaction";
import { createValueBus, useBusValue, type ValueBus } from "./overlay-bus";
import { waitForPageImages } from "./page-images";
import { TextEditorOverlay } from "./text-editor";
import { useDocumentFonts, type FontLoader } from "./use-document-fonts";

/** 정렬선에 붙는 거리 — 화면에서 잰다(축소해 놓아도 손맛이 같아야 한다). */
const SNAP_TOLERANCE_PX = 6;

/** 지금 집을 수 있는 형제들과, 그들이 놓인 좌표계의 원점. */
function scopeOf(
  store: CanvasStore,
  page: CanvasPage,
  scopeId: string | null,
): { list: CanvasElement[]; ox: number; oy: number } {
  const scope = scopeId ? store.getElementById(scopeId) : null;
  if (scope?.isContainer && store.getPageOfElement(scope.id)?.id === page.id) {
    return {
      list: scope.children,
      ox: num(scope, "x", 0),
      oy: num(scope, "y", 0),
    };
  }
  return { list: page.children, ox: 0, oy: 0 };
}

type GuideState = { pageId: string; guides: Guide[]; ox: number; oy: number } | null;
type MarqueeState = { pageId: string; rect: DocRect } | null;

/**
 * 잠깐 떴다 사라지는 것들 — 정렬선과 마퀴 상자.
 *
 * 요소를 그리는 층과 **따로** 둔다. 여기만 다시 그려지므로 끄는 내내 요소 트리는
 * 건드리지 않는다.
 */
function OverlayLayer({
  page,
  scale,
  guideBus,
  marqueeBus,
}: {
  page: CanvasPage;
  scale: number;
  guideBus: ValueBus<GuideState>;
  marqueeBus: ValueBus<MarqueeState>;
}) {
  const guideState = useBusValue(guideBus);
  const marquee = useBusValue(marqueeBus);
  const guides =
    guideState && guideState.pageId === page.id ? guideState : null;
  const box = marquee && marquee.pageId === page.id ? marquee.rect : null;
  // 배율이 얼마든 선은 항상 1px로 보여야 한다(Stage가 좌표를 통째로 늘린다).
  const hair = 1 / Math.max(scale, 0.01);

  return (
    <Layer listening={false}>
      {guides
        ? guides.guides.map((guide, i) => (
            <Line
              key={`${guide.orientation}-${i}`}
              points={
                guide.orientation === "v"
                  ? [
                      guide.position + guides.ox,
                      guide.from + guides.oy,
                      guide.position + guides.ox,
                      guide.to + guides.oy,
                    ]
                  : [
                      guide.from + guides.ox,
                      guide.position + guides.oy,
                      guide.to + guides.ox,
                      guide.position + guides.oy,
                    ]
              }
              stroke="#f43f5e"
              strokeWidth={hair}
              dash={[4 * hair, 4 * hair]}
            />
          ))
        : null}
      {box ? (
        <Rect
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          fill="rgba(37, 99, 235, 0.08)"
          stroke="#2563eb"
          strokeWidth={hair}
        />
      ) : null}
    </Layer>
  );
}

/** 이 페이지가 화면 근처에 왔는가 — 멀리 있는 페이지는 Stage를 안 만든다. */
function useNearViewport(margin: number): {
  ref: React.RefObject<HTMLDivElement | null>;
  near: boolean;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver !== "function") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setNear(entry.isIntersecting);
      },
      { rootMargin: `${margin}px 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [margin]);

  return { ref, near };
}

/**
 * 선택 표시와 크기 조절 손잡이.
 *
 * 그룹도 늘릴 수 있다 — 자손 좌표까지 `groupResizePatches`가 같이 흡수한다. 잠긴
 * 요소만 손잡이를 안 띄운다.
 */
function SelectionLayer({
  store,
  page,
}: {
  store: CanvasStore;
  page: CanvasPage;
}) {
  const selectionKey = useSelectionKey(store);
  const ref = useRef<Konva.Transformer | null>(null);

  const onPage = useMemo(
    () =>
      store.selectedElementsIds.filter(
        (id) => store.getPageOfElement(id)?.id === page.id,
      ),
    // selectionKey가 바뀔 때만 다시 고른다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectionKey, store, page.id],
  );

  useEffect(() => {
    const transformer = ref.current;
    const stage = transformer?.getStage();
    if (!transformer || !stage) return;
    const nodes = onPage
      .map((id) => stage.findOne(`#${id}`))
      .filter((node): node is Konva.Node => Boolean(node));
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [onPage]);

  const resizable = onPage.every((id) => !store.getElementById(id)?.locked);

  return (
    <Layer>
      <Transformer
        ref={ref}
        rotateEnabled={onPage.every((id) => !store.getElementById(id)?.locked)}
        resizeEnabled={resizable}
        ignoreStroke
        borderStroke="#2563eb"
        anchorStroke="#2563eb"
        anchorSize={8}
        flipEnabled={false}
      />
    </Layer>
  );
}

function PageView({
  store,
  page,
  scale,
  fontsVersion,
  interactive,
  scopeId,
  editingId,
  guideBus,
  marqueeBus,
  onPick,
  onDrill,
  onEditDone,
}: {
  store: CanvasStore;
  page: CanvasPage;
  scale: number;
  fontsVersion: number;
  interactive: boolean;
  scopeId: string | null;
  editingId: string | null;
  guideBus: ValueBus<GuideState>;
  marqueeBus: ValueBus<MarqueeState>;
  onPick: (id: string | null, shift: boolean) => void;
  onDrill: (id: string) => void;
  onEditDone: () => void;
}) {
  usePageVersion(page);
  const width = page.width;
  const height = page.height;
  const { ref, near } = useNearViewport(600);
  // 내려받기·GIF가 부탁하면 화면 밖 페이지도 그린다(안 그리면 뽑을 픽셀이 없다).
  const mount = near || store.isPageForced(page.id);
  // 화면에 붙일 때 한 번만 묻는다. 렌더마다 물으면 콘솔 경고가 쏟아진다.
  const watermark = useMemo(() => shouldWatermark(), []);

  const bindLayer = useCallback(
    (layer: Konva.Layer | null) => {
      store.registerPageSurface(
        page.id,
        layer
          ? {
              scale,
              ready: async () => {
                await waitForPageImages(page);
                // 리액트가 받은 그림으로 다시 커밋했으니 한 번 더 그려 놓고 뽑는다.
                layer.batchDraw();
              },
              toDataURL: (config) => layer.toDataURL(config),
            }
          : null,
      );
    },
    [store, page, scale],
  );
  const editingEl =
    editingId && store.getPageOfElement(editingId)?.id === page.id
      ? store.getElementById(editingId)
      : null;

  const hitId = useCallback(
    (event: Konva.KonvaEventObject<PointerEvent | MouseEvent>) => {
      const stage = event.target.getStage();
      const position = stage?.getPointerPosition();
      if (!stage || !position) return { id: null as string | null, skip: false };
      const shape = stage.getIntersection(position);
      if (isTransformerPart(shape as unknown as HitNode | null)) {
        return { id: null, skip: true };
      }
      const path = elementPath(shape as unknown as HitNode | null, store);
      return { id: pickFromPath(path, scopeId), skip: false };
    },
    [store, scopeId],
  );

  /** 마퀴를 시작한 자리(문서 좌표). 빈 곳을 눌렀을 때만 생긴다. */
  const marqueeFrom = useRef<{ x: number; y: number } | null>(null);

  const docPoint = useCallback(
    (event: Konva.KonvaEventObject<PointerEvent>) => {
      const stage = event.target.getStage();
      const position = stage?.getPointerPosition();
      if (!position) return null;
      return { x: position.x / scale, y: position.y / scale };
    },
    [scale],
  );

  const endMarquee = useCallback(
    (event: Konva.KonvaEventObject<PointerEvent>) => {
      const from = marqueeFrom.current;
      marqueeFrom.current = null;
      marqueeBus.set(null);
      if (!from) return;
      const to = docPoint(event);
      if (!to) return;
      const box = rectFromPoints(from.x, from.y, to.x, to.y);
      // 그냥 클릭(거의 안 끈 것)은 선택 해제로 남긴다 — 이미 pointerdown이 했다.
      if (box.width < 3 && box.height < 3) return;
      const { list, ox, oy } = scopeOf(store, page, scopeId);
      const hit = list.filter((el) => {
        if (el.locked) return false;
        const rect = elementRect(el);
        return rectsOverlap(box, {
          x: rect.x + ox,
          y: rect.y + oy,
          width: rect.width,
          height: rect.height,
        });
      });
      store.selectElements(hit.map((el) => el.id));
    },
    [docPoint, marqueeBus, page, scopeId, store],
  );

  return (
    <div
      ref={ref}
      data-lc-page={page.id}
      style={{
        position: "relative",
        width: width * scale,
        height: height * scale,
        background: str(page, "background", "#ffffff"),
      }}
    >
      {mount ? (
        <Stage
          width={width * scale}
          height={height * scale}
          scaleX={scale}
          scaleY={scale}
          onPointerDown={
            interactive
              ? (event: Konva.KonvaEventObject<PointerEvent>) => {
                  const { id, skip } = hitId(event);
                  if (skip) return;
                  onPick(id, event.evt.shiftKey);
                  // 빈 곳에서 시작한 끌기는 마퀴다(요소 위에서 시작하면 그 요소가 끌린다).
                  if (!id) marqueeFrom.current = docPoint(event);
                }
              : undefined
          }
          onPointerMove={
            interactive
              ? (event: Konva.KonvaEventObject<PointerEvent>) => {
                  const from = marqueeFrom.current;
                  if (!from) return;
                  const to = docPoint(event);
                  if (!to) return;
                  marqueeBus.set({
                    pageId: page.id,
                    rect: rectFromPoints(from.x, from.y, to.x, to.y),
                  });
                }
              : undefined
          }
          onPointerUp={interactive ? endMarquee : undefined}
          onPointerLeave={interactive ? endMarquee : undefined}
          onDblClick={
            interactive
              ? (event: Konva.KonvaEventObject<MouseEvent>) => {
                  const { id, skip } = hitId(event);
                  if (skip || !id) return;
                  onDrill(id);
                }
              : undefined
          }
        >
          <Layer key={fontsVersion} ref={bindLayer}>
            <Rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill={str(page, "background", "#ffffff")}
              listening={false}
            />
            {page.children.map((el) => (
              <ElementView key={el.id} el={el} />
            ))}
          </Layer>
          {interactive ? <SelectionLayer store={store} page={page} /> : null}
          {interactive ? (
            <OverlayLayer
              page={page}
              scale={scale}
              guideBus={guideBus}
              marqueeBus={marqueeBus}
            />
          ) : null}
        </Stage>
      ) : null}
      {editingEl ? (
        <TextEditorOverlay
          store={store}
          el={editingEl}
          scale={scale}
          onDone={onEditDone}
        />
      ) : null}
      {watermark ? (
        // 캔버스가 아니라 DOM에 얹는다 — 오리진을 못 읽는 자리에서 잘못 켜져도
        // 우리 export 산출물은 안 건드린다(license.ts 규칙 2·3).
        <div
          data-lc-watermark=""
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            padding: "2px 6px",
            borderRadius: 4,
            background: "rgba(17,17,17,0.55)",
            color: "#fff",
            font: "11px/1.4 system-ui, sans-serif",
            letterSpacing: "0.02em",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          leviosa-canvas
        </div>
      ) : null}
    </div>
  );
}

export function CanvasView({
  store,
  scale = 1,
  gap = 0,
  interactive = false,
  center = false,
  loadFont,
}: {
  store: CanvasStore;
  scale?: number;
  gap?: number;
  interactive?: boolean;
  /**
   * 남는 자리에서 가운데로 설 것인가. **자동 여백으로** 세운다 — 부모의 정렬로
   * 세우면 내용이 화면보다 커졌을 때 시작 쪽으로 스크롤을 못 하게 된다(자동 여백은
   * 남는 자리가 없으면 0이 되어 그냥 왼쪽 위에 선다).
   */
  center?: boolean;
  /** 폰트를 받아 오는 사람. 안 주면 브라우저가 이미 아는 서체만 그려진다 (G7 경계). */
  loadFont?: FontLoader;
}) {
  useCanvasVersion(store);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // 캔버스 위에 얹히는 층(표 레일 같은 것)이 줌을 알아야 상자를 다시 잰다.
  useEffect(() => store.setScale(scale), [store, scale]);
  const fontsVersion = useDocumentFonts(store, mounted, loadFont);
  /** 지금 안쪽을 들여다보고 있는 그룹. */
  const [scopeId, setScopeId] = useState<string | null>(null);
  // 정렬선·마퀴는 React 상태가 아니다(overlay-bus.ts의 이유).
  const guideBus = useMemo(() => createValueBus<GuideState>(null), []);
  const marqueeBus = useMemo(() => createValueBus<MarqueeState>(null), []);
  /** 지금 글자를 고치고 있는 요소. */
  const [editingId, setEditingId] = useState<string | null>(null);

  const onPick = useCallback(
    (id: string | null, shift: boolean) => {
      // 캔버스를 누르면 편집을 끝낸다 — 고치던 글자는 그대로 남는다.
      setEditingId(null);
      if (!id) {
        store.selectElements([]);
        setScopeId(null);
        return;
      }
      store.selectElements(
        shift ? toggleSelection(store.selectedElementsIds, id) : [id],
      );
    },
    [store],
  );

  const onDrill = useCallback(
    (id: string) => {
      const el = store.getElementById(id);
      if (!el) return;
      // 글자를 두 번 누르면 바로 고친다. 그룹 안 글자는 먼저 그룹으로 한 겹 들어간
      // 뒤(아래 분기) 다시 두 번 눌러야 열린다 — 한 겹씩 파고드는 동작 그대로다.
      if (el.type === "text" && !el.locked) {
        store.selectElements([el.id]);
        setEditingId(el.id);
        return;
      }
      // 그룹을 두 번 누르면 그 안으로 들어간다. 안쪽 요소를 두 번 누르면 그 요소의
      // 부모가 새 범위가 된다 — 한 겹씩 파고드는 동작.
      if (el.isContainer && el.children.length) {
        setScopeId(el.id);
        store.selectElements([el.children[el.children.length - 1].id]);
        return;
      }
      const parent = el.parent;
      if (parent && "isContainer" in parent) {
        setScopeId(parent.id);
        store.selectElements([el.id]);
      }
    },
    [store],
  );

  useEffect(() => {
    if (!interactive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // 편집 중이면 편집기 자신이 Esc를 처리한다(여기까지 오지 않는다).
        setScopeId(null);
        store.selectElements([]);
        return;
      }
      handleCanvasHotkey(event, store);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [interactive, store]);

  /** 끌기 한 번 동안만 사는 것들 — 스냅 상대와 내 상자. */
  const dragRef = useRef<{
    pageId: string;
    ox: number;
    oy: number;
    offX: number;
    offY: number;
    width: number;
    height: number;
    targets: DocRect[];
  } | null>(null);

  const handlers = useMemo<EditHandlers>(
    () => ({
      interactive,
      scopeId,
      editingId,
      onDragStart: (id) => {
        const el = store.getElementById(id);
        const page = store.getPageOfElement(id);
        if (!el || !page) return;
        const { list, ox, oy } = scopeOf(store, page, scopeId);
        const rect = elementRect(el);
        dragRef.current = {
          pageId: page.id,
          ox,
          oy,
          // 그룹은 자기 x/y와 그려지는 자리가 다르다 — 그 차이를 들고 있어야 끄는 중에도
          // 같은 상자를 잰다.
          offX: rect.x - num(el, "x", 0),
          offY: rect.y - num(el, "y", 0),
          width: rect.width,
          height: rect.height,
          targets: list
            .filter((other) => other.id !== id)
            .map((other) => elementRect(other)),
        };
      },
      onDragMove: (id, position) => {
        const drag = dragRef.current;
        if (!drag) return position;
        const moving: DocRect = {
          x: position.x + drag.offX,
          y: position.y + drag.offY,
          width: drag.width,
          height: drag.height,
        };
        // 손이 흔들리는 정도는 화면 기준이라, 문서 좌표로 바꿔서 잰다.
        const { dx, dy, guides } = snapRect(
          moving,
          drag.targets,
          { width: store.width, height: store.height },
          SNAP_TOLERANCE_PX / Math.max(store.scale, 0.01),
        );
        guideBus.set(
          guides.length
            ? { pageId: drag.pageId, guides, ox: drag.ox, oy: drag.oy }
            : null,
        );
        return { x: position.x + dx, y: position.y + dy };
      },
      onDragEnd: (id, position, altClone) => {
        dragRef.current = null;
        guideBus.set(null);
        const el = store.getElementById(id);
        if (!el) return;
        // 여럿을 함께 끌면 Konva가 노드마다 dragEnd를 부른다 — 한 트랜잭션으로 묶어
        // ⌘Z 한 번에 전부 돌아오게 한다.
        applyInTransaction(store, () => {
          // ⌥ 끌기 — 원래 자리에 복제본을 남기고, 끌던 쪽이 새 자리로 간다.
          if (altClone) el.clone(undefined, { skipSelect: true });
          el.set({ x: position.x, y: position.y });
        });
      },
      onTransformEnd: (id, result: TransformResult) => {
        const el = store.getElementById(id);
        if (!el) return;
        applyInTransaction(store, () => {
          if (!el.isContainer) {
            el.set(absorbTransform(el, result));
            return;
          }
          // 그룹은 자손 좌표까지 같이 흡수해야 그림이 안 깨진다.
          for (const { id: target, patch } of groupResizePatches(el, result)) {
            store.getElementById(target)?.set(patch);
          }
        });
      },
    }),
    [interactive, scopeId, editingId, store, guideBus],
  );

  // Konva는 브라우저 캔버스가 있어야 산다. 서버 렌더에서는 자리만 잡아 둔다.
  if (!mounted) {
    return <div data-lc-canvas="pending" style={{ width: store.width * scale }} />;
  }

  const frames = groupFrames(store.pages);
  const renderPage = (page: CanvasPage) => (
    <PageView
      key={page.id}
      store={store}
      page={page}
      scale={scale}
      fontsVersion={fontsVersion}
      interactive={interactive}
      scopeId={scopeId}
      editingId={editingId}
      guideBus={guideBus}
      marqueeBus={marqueeBus}
      onPick={onPick}
      onDrill={onDrill}
      onEditDone={() => setEditingId(null)}
    />
  );

  return (
    <EditContext.Provider value={handlers}>
      <div
        data-lc-canvas="ready"
        data-lc-scope={scopeId ?? ""}
        style={{
          display: "flex",
          width: "min-content",
          // 자동 여백이 남는 자리를 반씩 먹어 가운데로 세운다.
          ...(center ? { margin: "auto" } : {}),
          ...(frames.length > 1
            ? {
                flexDirection: "row" as const,
                alignItems: "flex-start" as const,
                // 열 사이는 장 사이보다 넓어야 한 벌이 한 덩이로 읽힌다.
                gap: gap * 2,
              }
            : { flexDirection: "column" as const, gap }),
        }}
      >
        {/* 프레임이 하나뿐이면 열로 감싸지 않는다 — 꼬리표가 없는 기존 문서는 예전과
            **똑같은 마크업**으로 그려져야 한다. 그것이 이 기능의 안전선이다. */}
        {frames.length > 1
          ? frames.map((frame) => (
              <div
                key={frame.key}
                data-lc-frame={frame.key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap,
                  width: "min-content",
                }}
              >
                {frame.pages.map(renderPage)}
              </div>
            ))
          : store.pages.map(renderPage)}
      </div>
    </EditContext.Provider>
  );
}
