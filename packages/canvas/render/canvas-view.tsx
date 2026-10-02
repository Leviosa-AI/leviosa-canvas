// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
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
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Layer, Line, Rect, Stage, Transformer } from "react-konva/es/ReactKonvaCore";

import { CanvasElement, withFreshIds, type CanvasPage, type CanvasStore } from "../store";
import { num, str } from "../types";
import {
  elementRect,
  moveElementTo,
  unionRect,
  type Rect as DocRect,
} from "../edit/rect";
import { handleCanvasHotkey } from "../edit/hotkeys";
import {
  rectFromPoints,
  rectsOverlap,
  snapRect,
  type Guide,
} from "../edit/snap";
import { useCanvasVersion, usePageVersion, useSelectionKey } from "../use-canvas";
import { EditContext, type EditHandlers } from "./edit-context";
import { frameOf, groupFrames } from "./frames";
import { ElementView, FontsVersionContext } from "./element-view";
import { elementPath, isTransformerPart, type HitNode } from "./hit-path";
import {
  absorbTransform,
  applyInTransaction,
  groupResizePatches,
  isDoubleTap,
  resolveFlip,
  pickFromPath,
  toggleSelection,
  type Tap,
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

/**
 * 누른 요소로 고칠 선택.
 *
 * 이미 골라 둔 것을 (시프트 없이) 누르면 **선택을 그대로 둔다** — 여럿을 골라 놓고 그중
 * 하나를 잡아 끌면 다 같이 움직여야 한다. 거기서 하나로 줄여 버리면 끌기가 그 하나만 옮긴다.
 */
export function nextSelection(
  current: string[],
  id: string,
  shift: boolean,
): string[] {
  if (shift) return toggleSelection(current, id);
  return current.includes(id) ? current : [id];
}

/**
 * 마퀴 상자에 걸린 요소들. 잠긴 것·숨긴 것은 안 걸린다.
 * 시프트를 누른 채 그었으면 지금 선택에 **더한다**(Figma와 같다).
 */
export function marqueeSelection(
  store: CanvasStore,
  page: CanvasPage,
  scopeId: string | null,
  box: DocRect,
  shift: boolean,
): string[] {
  const { list, ox, oy } = scopeOf(store, page, scopeId);
  const hit = list
    .filter((el) => {
      if (el.locked || el.visible === false) return false;
      const rect = elementRect(el);
      return rectsOverlap(box, {
        x: rect.x + ox,
        y: rect.y + oy,
        width: rect.width,
        height: rect.height,
      });
    })
    .map((el) => el.id);
  if (!shift) return hit;
  const current = store.selectedElementsIds;
  return [...current, ...hit.filter((id) => !current.includes(id))];
}

/** 끌 때 붙을 상대 — 같이 끌리는 것(선택 전부)과 숨긴 것은 뺀다. */
export function snapTargets(
  list: ReadonlyArray<CanvasElement>,
  moving: ReadonlyArray<string>,
): DocRect[] {
  return list
    .filter((el) => !moving.includes(el.id) && el.visible !== false)
    .map((el) => elementRect(el));
}

/** 글자를 치는 중인가 — 그때의 Esc는 입력칸의 것이다. */
function isTyping(): boolean {
  const active = typeof document === "undefined" ? null : document.activeElement;
  if (!active) return false;
  return (
    active.tagName === "INPUT" ||
    active.tagName === "TEXTAREA" ||
    (active as HTMLElement).isContentEditable === true
  );
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
        // 손잡이를 반대편으로 넘기면 뒤집힌다 — 음수 scale은 `resolveFlip`이
        // flipX/flipY로 바꿔 문서에 쓴다(element-view가 그린다).
        rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
        rotationSnapTolerance={5}
        // 여럿을 함께 늘리면 Konva가 노드마다 transformend를 부른다 — 제스처 하나를
        // 트랜잭션 하나로 묶는다. 트랜스포머 자신의 transformend가 노드들보다 **먼저**
        // 오므로, 닫는 일은 노드들이 다 끝난 뒤(마이크로태스크)로 미룬다.
        onTransformStart={() => store.history.startTransaction()}
        onTransformEnd={() =>
          queueMicrotask(() => store.history.endTransaction())
        }
      />
    </Layer>
  );
}

const PageView = memo(function PageView({
  store,
  page,
  scale,
  fontsVersion,
  interactive,
  forced,
  scopeId,
  editingId,
  raised,
  renderChrome,
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
  /**
   * 내려받기·GIF가 이 판을 띄워 달라고 했는가. 스토어에서 읽지 않고 받는다 — 이 뷰는
   * memo라 prop이 안 바뀌면 다시 안 그려진다.
   */
  forced: boolean;
  scopeId: string | null;
  editingId: string | null;
  /** 끌리는 중인 판. 다른 판 위로 올려 그려서 끌던 것이 안 가리게 한다. */
  raised?: boolean;
  /** 판 위에 얹을 것(손잡이 등). 판 상자 안에 그린다. */
  renderChrome?: (pageId: string) => ReactNode;
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
  const mount = near || forced;
  // 화면에 붙일 때 한 번만 묻는다. 렌더마다 물으면 콘솔 경고가 쏟아진다.

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

  // 손가락 두 번 누르기. Konva 의 `dbltap` 은 못 쓴다 — 첫 탭에 고르면 선택 상자가 그
  // 위에 깔려서, 두 번째 탭의 누른 도형(상자)과 뗀 도형(글자)이 달라 안 터진다. 그래서
  // 누르기 두 번을 직접 잰다. 두 번째가 상자 위면 지금 고른 것을 두 번 누른 것으로 본다.
  const lastTap = useRef<Tap | null>(null);
  const touchDoubleTap = useCallback(
    (event: Konva.KonvaEventObject<PointerEvent>, hit: string | null, skip: boolean) => {
      const id = hit ?? (skip ? (store.selectedElementsIds[0] ?? null) : null);
      if (!id) {
        lastTap.current = null;
        return false;
      }
      const tap = { at: event.evt.timeStamp, x: event.evt.clientX, y: event.evt.clientY, id };
      const double = isDoubleTap(lastTap.current, tap);
      lastTap.current = double ? null : tap;
      if (double) onDrill(id);
      return double;
    },
    [store, onDrill],
  );

  /**
   * 빈 곳에서 시작한 끌기는 마퀴다.
   *
   * 움직임과 손 떼기는 **창에서** 듣는다. Stage에서 들으면 판 밖으로 나가는 순간
   * 끝나 버려, 판 가장자리 요소를 넉넉히 감싸 고를 수가 없다.
   */
  const startMarquee = useCallback(
    (event: Konva.KonvaEventObject<PointerEvent>) => {
      const stage = event.target.getStage();
      const position = stage?.getPointerPosition();
      if (!stage || !position) return;
      const from = { x: position.x / scale, y: position.y / scale };
      const shift = event.evt.shiftKey;
      const toDoc = (e: PointerEvent) => {
        const box = stage.container().getBoundingClientRect();
        return rectFromPoints(
          from.x,
          from.y,
          (e.clientX - box.left) / scale,
          (e.clientY - box.top) / scale,
        );
      };
      const onMove = (e: PointerEvent) =>
        marqueeBus.set({ pageId: page.id, rect: toDoc(e) });
      const onUp = (e: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        marqueeBus.set(null);
        const box = toDoc(e);
        // 그냥 클릭(거의 안 끈 것)은 pointerdown이 이미 처리했다.
        if (box.width < 3 && box.height < 3) return;
        store.selectElements(marqueeSelection(store, page, scopeId, box, shift));
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [marqueeBus, page, scale, scopeId, store],
  );

  return (
    <div
      ref={ref}
      data-lc-page={page.id}
      style={{
        position: "relative",
        zIndex: raised ? 5 : undefined,
        width: width * scale,
        height: height * scale,
        background: str(page, "background", "#ffffff"),
      }}
    >
      {renderChrome?.(page.id)}
      {mount ? (
        <Stage
          width={width * scale}
          height={height * scale}
          scaleX={scale}
          scaleY={scale}
          onPointerDown={
            interactive
              ? (event: Konva.KonvaEventObject<PointerEvent>) => {
                  const { id: hit, skip } = hitId(event);
                  if (
                    event.evt.pointerType === "touch" &&
                    touchDoubleTap(event, hit, skip)
                  ) {
                    return;
                  }
                  if (skip) return;
                  // 잠긴 요소는 집히지 않는다 — 빈 곳처럼 본다. 잠근 배경 위에서도
                  // 마퀴를 그을 수 있어야 한다.
                  const id = hit && store.getElementById(hit)?.locked ? null : hit;
                  onPick(id, event.evt.shiftKey);
                  // 빈 곳에서 시작한 끌기는 마퀴다(요소 위에서 시작하면 그 요소가 끌린다).
                  if (!id) startMarquee(event);
                }
              : undefined
          }
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
          {/* 폰트가 오면 Layer를 새로 만들지 않고 글자만 다시 잰다(element-view). */}
          <Layer ref={bindLayer}>
            <FontsVersionContext.Provider value={fontsVersion}>
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
            </FontsVersionContext.Provider>
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
    </div>
  );
});

/**
 * 다른 판 위에서 손을 뗐는가. 맞으면 그 판으로 옮겨 놓고 `true` 를 준다.
 *
 * 판마다 무대가 따로라 문서 좌표로는 알 수 없다 — 끌던 좌표는 여전히 «원래 판 안»을
 * 가리킨다. 그래서 손이 있던 **화면 좌표** 아래에 무엇이 있는지 DOM 에 직접 묻는다.
 *
 * ## 끄는 것은 언제나 «옮기는» 일이다
 *
 * 한때 벌을 넘을 때만 베끼게 뒀다 — «저 안의 저것을 여기도 쓰겠다»는 뜻으로 읽은
 * 것이다. 그런데 화면에서는 그 둘이 똑같은 손짓이라, 벌을 넘겼을 뿐인데 원본이 남아
 * 두 개가 되는 것이 놀랍다. 끌기는 옮기고, 베끼려면 ⌥ 를 누른다 — 다른 편집기가
 * 다 그렇고, 같은 판 안에서 이미 그렇게 돌고 있었다.
 */
/** 판을 살짝 벗어나 놓아도 받아 주는 거리(화면 픽셀). */
const DROP_REACH_PX = 80;

/**
 * 이 화면 좌표가 가리키는 판.
 *
 * 두 가지를 견딘다.
 *
 * **위에 얹힌 겹.** `elementFromPoint` 하나만 쓰면 맨 위 한 겹만 답이라, 판 위에 뭔가가
 * 손끝을 가리는 순간 «판이 없다»가 된다. 겹을 다 받아 그 중 첫 판을 고른다.
 *
 * **판과 판 사이의 여백.** 판 사이나 벌의 테두리 안쪽에 놓으면 그 자리는 판이 아니다.
 * 사람은 «이 벌에 놓았다»고 생각하는데 끌기는 실패하고, 예전에는 그 다음 줄이 판 밖
 * 좌표를 요소에 찍어 **요소가 목록에만 남고 사라졌다.** 손끝에서 가장 가까운 판이
 * 코앞에 있으면 그 판으로 받는다.
 */
function pageUnder(client: { x: number; y: number }): HTMLElement | null {
  const stack =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(client.x, client.y)
      : [document.elementFromPoint(client.x, client.y)];
  for (const node of stack) {
    const page = (node as HTMLElement | null)?.closest<HTMLElement>("[data-lc-page]");
    if (page?.dataset.lcPage) return page;
  }

  let best: HTMLElement | null = null;
  let bestGap = DROP_REACH_PX;
  for (const node of document.querySelectorAll<HTMLElement>("[data-lc-page]")) {
    const box = node.getBoundingClientRect();
    const dx = Math.max(box.left - client.x, 0, client.x - box.right);
    const dy = Math.max(box.top - client.y, 0, client.y - box.bottom);
    const gap = Math.hypot(dx, dy);
    if (gap < bestGap) {
      best = node;
      bestGap = gap;
    }
  }
  return best;
}

export function dropOnOtherPage(
  store: CanvasStore,
  id: string,
  client: { x: number; y: number },
  /** 끌던 노드가 멈춘 자리(원래 판의 문서 좌표). Konva 가 손끝을 따라 옮겨 둔 값이다. */
  position: { x: number; y: number } | null,
  clone: boolean,
): boolean {
  const under = pageUnder(client);
  const targetId = under?.dataset.lcPage;
  if (!under || !targetId) return false;

  const home = store.getPageOfElement(id);
  const target = store.getPageById(targetId);
  const el = store.getElementById(id);
  if (!home || !target || !el || home.id === target.id) return false;

  const rect = under.getBoundingClientRect();
  const homeRect = document
    .querySelector<HTMLElement>(`[data-lc-page="${CSS.escape(home.id)}"]`)
    ?.getBoundingClientRect();
  const scale = store.scale || 1;
  const box = elementRect(el);
  // **잡았던 자리가 손끝에 그대로 붙어 있어야** 옮긴 것이 옮긴 대로 앉는다. 가운데를
  // 커서에 맞추면 손을 떼는 순간 요소가 튄다. 잡은 자리를 못 받았을 때만 가운데로.
  // 판 밖으로는 안 나가게 가둔다 — 가장자리에 놓으면 절반이 걸려서 «넘어가긴 했는데
  // 안 보이는» 것이 된다.
  const fit = (value: number, span: number, limit: number) =>
    span >= limit ? value : Math.max(0, Math.min(limit - span, value));
  // **그려져 있던 자리가 놓일 자리다.**
  //
  // 손끝에서 되짚지 않는다. 그러려면 끌기가 시작될 때의 손끝과 판 상자를 잡아 두고
  // 끝날 때의 손끝과 짝을 맞춰야 하는데, 그 사이에 하나라도 어긋나면(끌기 시작
  // 이벤트에 손끝이 안 실려 오거나, 그동안 화면이 움직이거나) 요소가 엉뚱한 데
  // 앉는다. Konva 가 이미 손끝을 따라 노드를 옮겨 두었으니 그 값을 그대로 쓴다 —
  // 화면에서 보이던 그 자리다.
  //
  // 기준은 **보이는 네모의 왼쪽 위**다. `x/y` 속성이 아니다 — 그룹은 자식들이 차지한
  // 자리만큼, 돌려 둔 요소는 돌아간 만큼 그 둘이 다르다.
  const skewX = box.x - num(el, "x", 0);
  const skewY = box.y - num(el, "y", 0);
  const drawn =
    position && homeRect
      ? {
          x: (homeRect.left + (position.x + skewX) * scale - rect.left) / scale,
          y: (homeRect.top + (position.y + skewY) * scale - rect.top) / scale,
        }
      : {
          x: (client.x - rect.left) / scale - box.width / 2,
          y: (client.y - rect.top) / scale - box.height / 2,
        };
  const left = fit(drawn.x, box.width, target.width);
  const top = fit(drawn.y, box.height, target.height);

  const json = withFreshIds(el.toJSON());
  let made: CanvasElement | null = null;
  applyInTransaction(store, () => {
    made = target.addElement(json);
    // 앉힌 **뒤에** 옮긴다. 자리는 자식까지 아우른 네모로 재야 해서, 요소가 스토어에
    // 붙어 있어야 잴 수 있다.
    moveElementTo(made, left, top);
    if (!clone) store.deleteElements([id]);
  });
  if (made) store.selectElements([(made as CanvasElement).id]);
  return true;
}

export function CanvasView({
  store,
  scale = 1,
  gap = 0,
  interactive = false,
  center = false,
  frameGap,
  renderFrameHeader,
  renderPageChrome,
  frameInsert,
  frameStyle,
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
  /** 벌 사이 거리(화면 px). 안 주면 장 사이의 두 배. */
  frameGap?: number;
  /**
   * 열 하나 위에 얹을 것 — 이름표 같은 것. **무엇을 그릴지는 엔진이 모른다.**
   * 확정이니 선택이니 하는 말은 편집기의 것이지 판을 그리는 쪽의 것이 아니다.
   */
  renderFrameHeader?: (frameKey: string) => ReactNode;
  /**
   * 판 하나 위에 얹을 것 — 끌기 손잡이 같은 것.
   *
   * **판 상자 안에** 그린다. 밖에서 마우스 자리를 재어 띄우면 손이 손잡이 쪽으로
   * 다가가는 동안 «판 밖»을 지나며 깜빡인다. 안에 있으면 잴 것이 없고 깜빡일 일도
   * 없다 — 보이고 안 보이고는 CSS 가 정한다.
   */
  renderPageChrome?: (pageId: string) => ReactNode;
  /**
   * 지금 끼어들 자리. 그 자리에 빈칸을 하나 끼워 넣어 **판들이 밀려나게** 한다.
   *
   * 위에 겹쳐 그리면 밑의 판을 가릴 뿐이라 «사이가 벌어졌다»가 안 된다. 열은
   * 세로로 쌓인 흐름이라, 빈칸을 흐름 안에 넣으면 미는 일은 배치가 알아서 한다.
   */
  frameInsert?: {
    frameKey: string;
    at: number;
    height: number;
    full: boolean;
  } | null;
  /** 열 상자에 얹을 모양(테두리·바탕·흐리기). 위와 같은 이유로 값만 받는다. */
  frameStyle?: (frameKey: string) => CSSProperties | undefined;
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
  /**
   * 지금 끌리고 있는 요소.
   *
   * 판마다 무대가 따로라, 요소를 판 밖으로 끌면 그 캔버스에 **잘려서 사라진다** —
   * 어디에 놓이는지 안 보이는 채로 손을 떼게 된다. 그래서 끄는 동안 두 가지를 한다:
   * 그 판을 다른 판 위로 올리고, 커서를 따라다니는 자국을 모든 판 위에 그린다.
   */
  const [dragging, setDragging] = useState<{
    pageId: string;
    width: number;
    height: number;
    /** 보이는 네모와 `x/y` 속성의 차. 그룹·돌린 요소에서 둘이 다르다. */
    skewX: number;
    skewY: number;
    /** 끌리는 요소를 그 자리에서 뜬 그림. 못 뜨면 없다(테두리만 그린다). */
    image?: string;
  } | null>(null);
  /**
   * 커서를 따라다니는 자국. React 상태로 들고 있으면 pointermove마다 작업 영역 전체가
   * 다시 그려진다 — 자리는 DOM에 바로 쓴다.
   */
  const ghostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * 요소의 어디를 잡았는가(판 좌표).
   *
   * 이걸 안 들고 있으면 놓을 때 «커서에 가운데를 맞추는» 수밖에 없고, 그러면 손을
   * 떼는 순간 요소가 잡았던 자리에서 튄다. 잡은 자리가 손끝에 그대로 붙어 있어야
   * 옮긴 것이 옮긴 대로 앉는다.
   */
  /**
   * 끌던 노드가 지금 있는 자리(원래 판의 문서 좌표).
   *
   * 자국과 놓기가 **같은 값**을 봐야 한다. 자국은 손끝을, 놓기는 노드를 보고 있으면
   * 눈에 보이던 자리와 앉는 자리가 갈린다.
   */
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      const box = rootRef.current?.getBoundingClientRect();
      if (!box) return;
      // 제 판 위에서는 자국을 그리지 않는다. 거기서는 진짜 요소가 이미 손을 따라
      // 잘 움직이고 있어서, 자국까지 겹치면 같은 것이 두 겹으로 보인다. 자국은
      // 무대 밖으로 나가 **잘려서 안 보이는 동안**만 필요하다.
      const over = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-lc-page]")?.dataset.lcPage;
      const homeBox = document
        .querySelector<HTMLElement>(`[data-lc-page="${CSS.escape(dragging.pageId)}"]`)
        ?.getBoundingClientRect();
      const pos = dragPosRef.current;
      const ghost = ghostRef.current;
      if (!ghost) return;
      if (over === dragging.pageId || !homeBox || !pos) {
        ghost.style.display = "none";
        return;
      }
      ghost.style.display = "block";
      ghost.style.left = `${homeBox.left - box.left + (pos.x + dragging.skewX) * scale}px`;
      ghost.style.top = `${homeBox.top - box.top + (pos.y + dragging.skewY) * scale}px`;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [dragging, scale]);

  const onPick = useCallback(
    (id: string | null, shift: boolean) => {
      // 캔버스를 누르면 편집을 끝낸다 — 고치던 글자는 그대로 남는다.
      setEditingId(null);
      if (!id) {
        // 시프트를 누른 채 빈 곳을 누르면 마퀴로 선택에 더하려는 것이다 — 비우지 않는다.
        if (shift) return;
        store.selectElements([]);
        setScopeId(null);
        return;
      }
      store.selectElements(nextSelection(store.selectedElementsIds, id, shift));
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
        // 편집 중이면 편집기 자신이 Esc를 처리한다(여기까지 오지 않는다). 다른 입력칸의
        // Esc도 그 칸의 것이다 — 선택을 날리지 않는다.
        if (isTyping()) return;
        setScopeId(null);
        store.selectElements([]);
        return;
      }
      handleCanvasHotkey(event, store, {
        // 줌 버튼과 같은 범위로 가둔다(shell/zoom-buttons.tsx).
        setScale: (next) => store.setScale(Math.max(0.05, Math.min(5, next))),
        // ⌘A·⌘V 가 들어가 있는 그룹을 따르게 한다.
        scopeId,
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [interactive, store, scopeId]);

  /**
   * 끌기 한 번 동안만 사는 것들 — 스냅 상대와 내 상자.
   *
   * 여럿을 끌면 Konva가 노드마다 dragstart/dragend를 부른다(트랜스포머가 나머지를
   * 따라 끈다). 맨 처음 것이 «잡은 것»이고, 스냅은 그 하나로 선택 전체의 합집합을 재서
   * 나머지에게 같은 만큼 먹인다. `active`가 0이 되면 끌기가 끝난 것이다.
   */
  const dragRef = useRef<{
    primaryId: string;
    active: number;
    pageId: string;
    page: { width: number; height: number };
    ox: number;
    oy: number;
    offX: number;
    offY: number;
    width: number;
    height: number;
    targets: DocRect[];
    /** 잡은 것에 마지막으로 먹인 스냅 — 함께 끌리는 것들도 같은 만큼 민다. */
    dx: number;
    dy: number;
  } | null>(null);

  const handlers = useMemo<EditHandlers>(
    () => ({
      interactive,
      scopeId,
      editingId,
      onDragStart: (id, node) => {
        if (dragRef.current) {
          dragRef.current.active += 1;
          return;
        }
        const el = store.getElementById(id);
        const page = store.getPageOfElement(id);
        if (!el || !page) return;
        // 끌기 하나(함께 끌리는 노드 전부)가 ⌘Z 한 번이다 — 마지막 dragend에서 닫는다.
        store.history.startTransaction();
        const size = elementRect(el);
        dragPosRef.current = { x: num(el, "x", 0), y: num(el, "y", 0) };
        // 무대 밖에서 보여 줄 것은 «테두리»가 아니라 그 요소 자체다. 끌기가
        // 시작되는 이 한 번만 그림으로 뜬다 — 남의 그림이 섞여 캔버스가 오염된
        // 경우에는 못 뜨므로, 그때는 테두리로 물러난다.
        let image: string | undefined;
        try {
          // 배율은 **그림이 들고 온 크기 그대로** 쓴다. 상자 크기를 따로
          // 셈해서 씌우면 한 군데만 어긋나도 통째로 커지거나 작아진다.
          image = node?.toDataURL();
        } catch {
          image = undefined;
        }
        setDragging({
          pageId: page.id,
          width: size.width,
          height: size.height,
          skewX: size.x - num(el, "x", 0),
          skewY: size.y - num(el, "y", 0),
          image,
        });
        const { list, ox, oy } = scopeOf(store, page, scopeId);
        const moving = store.selectedElementsIds.includes(id)
          ? store.selectedElementsIds
          : [id];
        // 스냅은 선택 전체의 합집합으로 잰다 — 잡은 하나만 재면 나머지가 엉뚱하게 붙는다.
        const rect =
          unionRect(
            list.filter((one) => moving.includes(one.id)).map((one) => elementRect(one)),
          ) ?? size;
        dragRef.current = {
          primaryId: id,
          active: 1,
          pageId: page.id,
          page: { width: page.width ?? store.width, height: page.height ?? store.height },
          ox,
          oy,
          // 그룹은 자기 x/y와 그려지는 자리가 다르다 — 그 차이를 들고 있어야 끄는 중에도
          // 같은 상자를 잰다.
          offX: rect.x - num(el, "x", 0),
          offY: rect.y - num(el, "y", 0),
          width: rect.width,
          height: rect.height,
          targets: snapTargets(list, moving),
          dx: 0,
          dy: 0,
        };
      },
      onDragMove: (id, position) => {
        const drag = dragRef.current;
        if (!drag) return position;
        if (id !== drag.primaryId) {
          return { x: position.x + drag.dx, y: position.y + drag.dy };
        }
        dragPosRef.current = position;
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
          drag.page,
          SNAP_TOLERANCE_PX / Math.max(store.scale, 0.01),
        );
        drag.dx = dx;
        drag.dy = dy;
        guideBus.set(
          guides.length
            ? { pageId: drag.pageId, guides, ox: drag.ox, oy: drag.oy }
            : null,
        );
        return { x: position.x + dx, y: position.y + dy };
      },
      onDragEnd: (id, position, altClone, client) => {
        const drag = dragRef.current;
        const last = !drag || --drag.active <= 0;
        if (last) {
          dragRef.current = null;
          guideBus.set(null);
          setDragging(null);
        }
        try {
          const el = store.getElementById(id);
          if (!el) return;
          // 남의 판 위에서 손을 뗐으면 그 판으로 옮긴다. 문서가 바뀌면 원래 판도 다시
          // 그려지므로, 끌던 노드는 저절로 제자리로 돌아간다.
          if (client && dropOnOtherPage(store, id, client, position, !!altClone)) {
            return;
          }
          // **판 밖에서 손을 뗐으면 아무것도 안 한다.** 벌 사이의 빈 자리나 화면 여백에
          // 놓았다는 뜻인데, 거기에 요소를 둘 자리는 없다. 그래도 좌표를 찍어 버리면
          // 판 밖으로 나가 **보이지 않게 되고**, 목록에는 남아 있어 «옮겨지지도 않고
          // 숨었다»가 된다. 손을 놓은 자리가 판이 아니면 제자리로 돌려보낸다.
          if (client && !pageUnder(client)) {
            store.refreshElement(id);
            return;
          }
          // ⌥ 끌기 — 원래 자리에 복제본을 남기고, 끌던 쪽이 새 자리로 간다.
          if (altClone) el.clone(undefined, { skipSelect: true });
          el.set({ x: position.x, y: position.y });
        } finally {
          if (last && drag) store.history.endTransaction();
        }
      },
      onTransformEnd: (id, result: TransformResult) => {
        const el = store.getElementById(id);
        if (!el) return;
        // 손잡이를 반대편으로 넘겼으면 음수 scale → flipX/flipY.
        const { result: resolved, flip } = resolveFlip(el, result);
        applyInTransaction(store, () => {
          if (!el.isContainer) {
            el.set({ ...absorbTransform(el, resolved), ...flip });
            return;
          }
          // 그룹은 자손 좌표까지 같이 흡수해야 그림이 안 깨진다.
          for (const { id: target, patch } of groupResizePatches(el, resolved)) {
            store.getElementById(target)?.set(patch);
          }
          if (flip) el.set(flip);
        });
      },
    }),
    [interactive, scopeId, editingId, store, guideBus],
  );

  const onEditDone = useCallback(() => setEditingId(null), []);

  // Konva는 브라우저 캔버스가 있어야 산다. 서버 렌더에서는 자리만 잡아 둔다.
  if (!mounted) {
    return <div data-lc-canvas="pending" style={{ width: store.width * scale }} />;
  }

  const frames = groupFrames(store.pages);
  const framePagesWithSlot = (key: string, kids: ReactNode[]): ReactNode[] => {
    if (!frameInsert || frameInsert.frameKey !== key) return kids;
    const at = Math.max(0, Math.min(kids.length, frameInsert.at));
    const slot = (
      <div
        key="lc-insert-slot"
        data-lc-insert-slot=""
        style={{
          height: frameInsert.height,
          borderRadius: 6,
          border: `2px dashed ${frameInsert.full ? "#c0392b" : "#2563eb"}`,
          background: frameInsert.full
            ? "rgba(192, 57, 43, 0.10)"
            : "rgba(37, 99, 235, 0.12)",
        }}
      />
    );
    return [...kids.slice(0, at), slot, ...kids.slice(at)];
  };
  const renderPage = (page: CanvasPage) => (
    <PageView
      key={page.id}
      store={store}
      page={page}
      scale={scale}
      fontsVersion={fontsVersion}
      interactive={interactive}
      forced={store.isPageForced(page.id)}
      scopeId={scopeId}
      editingId={editingId}
      raised={dragging?.pageId === page.id}
      renderChrome={renderPageChrome}
      guideBus={guideBus}
      marqueeBus={marqueeBus}
      onPick={onPick}
      onDrill={onDrill}
      onEditDone={onEditDone}
    />
  );

  return (
    <EditContext.Provider value={handlers}>
      <div
        ref={rootRef}
        data-lc-canvas="ready"
        data-lc-scope={scopeId ?? ""}
        style={{
          position: "relative",
          display: "flex",
          width: "min-content",
          // 자동 여백이 남는 자리를 반씩 먹어 가운데로 세운다.
          ...(center ? { margin: "auto" } : {}),
          ...(frames.length > 1
            ? {
                flexDirection: "row" as const,
                alignItems: "flex-start" as const,
                // 열 사이는 장 사이보다 넓어야 한 벌이 한 덩이로 읽힌다.
                gap: frameGap ?? gap * 2,
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
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  gap,
                  width: "min-content",
                  ...frameStyle?.(frame.key),
                }}
              >
                {/* 이름표는 열의 **폭에 안 낀다**. 열은 판 너비만큼만 넓어야 하는데,
                    글자가 흐름에 끼면 많이 줄였을 때 이름이 열을 벌려 놓는다. */}
                {renderFrameHeader?.(frame.key)}
                {framePagesWithSlot(frame.key, frame.pages.map(renderPage))}
              </div>
            ))
          : store.pages.map(renderPage)}

        {/* 끌리는 요소의 자국. 무대 밖에서도 보여야 하므로 판이 아니라 여기서 그린다. */}
        {dragging ? (
          <div
            ref={ghostRef}
            style={{
              position: "absolute",
              // 자리는 pointermove가 바로 쓴다. 제 판 위에 있는 동안은 안 보인다.
              display: "none",
              // 크기를 안 정한다 — 그림이 들고 온 크기가 곧 화면에 있던 크기다.
              // 자리는 노드가 있는 곳에서 바로 왔으므로 손끝으로 되짚지 않는다.
              zIndex: 20,
              pointerEvents: "none",
              ...(dragging.image
                ? { opacity: 0.9 }
                : {
                    width: dragging.width * scale,
                    height: dragging.height * scale,
                    border: "2px dashed rgba(37, 99, 235, 0.9)",
                    background: "rgba(37, 99, 235, 0.08)",
                    borderRadius: 4,
                  }),
            }}
          >
            {dragging.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dragging.image} alt="" draggable={false} style={{ display: "block" }} />
            ) : null}
          </div>
        ) : null}
      </div>
    </EditContext.Provider>
  );
}
