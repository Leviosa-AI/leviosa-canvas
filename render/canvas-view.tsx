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

import "konva/lib/shapes/Transformer";

import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Rect, Stage, Transformer } from "react-konva/es/ReactKonvaCore";

import type { CanvasPage, CanvasStore } from "../store";
import { str } from "../types";
import { useCanvasVersion, usePageVersion, useSelectionKey } from "../use-canvas";
import { EditContext, type EditHandlers } from "./edit-context";
import { ElementView } from "./element-view";
import { elementPath, isTransformerPart, type HitNode } from "./hit-path";
import {
  absorbTransform,
  applyInTransaction,
  pickFromPath,
  toggleSelection,
  type TransformResult,
} from "./interaction";
import { TextEditorOverlay } from "./text-editor";
import { useDocumentFonts } from "./use-document-fonts";

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
 * 그룹은 지금 **옮기고 돌릴 수만** 있다. 그룹을 늘리려면 자식 좌표를 전부 다시 계산해야
 * 하는데(M3 범위 밖), 반만 되는 손잡이를 띄우면 사람이 늘렸다가 그림이 깨진다.
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

  const resizable = onPage.every((id) => {
    const el = store.getElementById(id);
    return el ? !el.isContainer && !el.locked : false;
  });

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
  onPick: (id: string | null, shift: boolean) => void;
  onDrill: (id: string) => void;
  onEditDone: () => void;
}) {
  usePageVersion(page);
  const width = page.width;
  const height = page.height;
  const { ref, near } = useNearViewport(600);
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
      {near ? (
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
          <Layer key={fontsVersion}>
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
}

export function CanvasView({
  store,
  scale = 1,
  gap = 0,
  interactive = false,
}: {
  store: CanvasStore;
  scale?: number;
  gap?: number;
  interactive?: boolean;
}) {
  useCanvasVersion(store);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const fontsVersion = useDocumentFonts(store, mounted);
  /** 지금 안쪽을 들여다보고 있는 그룹. */
  const [scopeId, setScopeId] = useState<string | null>(null);
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
      if (event.key !== "Escape") return;
      // 편집 중이면 편집기 자신이 Esc를 처리한다(여기까지 오지 않는다).
      setScopeId(null);
      store.selectElements([]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [interactive, store]);

  const handlers = useMemo<EditHandlers>(
    () => ({
      interactive,
      scopeId,
      editingId,
      onDragEnd: (id, position) => {
        const el = store.getElementById(id);
        if (!el) return;
        // 여럿을 함께 끌면 Konva가 노드마다 dragEnd를 부른다 — 한 트랜잭션으로 묶어
        // ⌘Z 한 번에 전부 돌아오게 한다.
        applyInTransaction(store, () => el.set({ x: position.x, y: position.y }));
      },
      onTransformEnd: (id, result: TransformResult) => {
        const el = store.getElementById(id);
        if (!el) return;
        applyInTransaction(store, () => el.set(absorbTransform(el, result)));
      },
    }),
    [interactive, scopeId, editingId, store],
  );

  // Konva는 브라우저 캔버스가 있어야 산다. 서버 렌더에서는 자리만 잡아 둔다.
  if (!mounted) {
    return <div data-lc-canvas="pending" style={{ width: store.width * scale }} />;
  }

  return (
    <EditContext.Provider value={handlers}>
      <div
        data-lc-canvas="ready"
        data-lc-scope={scopeId ?? ""}
        style={{
          display: "flex",
          flexDirection: "column",
          gap,
          width: "min-content",
        }}
      >
        {store.pages.map((page) => (
          <PageView
            key={page.id}
            store={store}
            page={page}
            scale={scale}
            fontsVersion={fontsVersion}
            interactive={interactive}
            scopeId={scopeId}
            editingId={editingId}
            onPick={onPick}
            onDrill={onDrill}
            onEditDone={() => setEditingId(null)}
          />
        ))}
      </div>
    </EditContext.Provider>
  );
}
