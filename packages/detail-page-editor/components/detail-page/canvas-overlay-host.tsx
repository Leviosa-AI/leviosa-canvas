"use client";

import { useMemo, useSyncExternalStore, type RefObject } from "react";

import {
  legacyStoreFacade,
  type LegacyStoreFacade,
} from "./canvas-store-facade";
import { SpecResizeAbsorber } from "./spec-resize-absorber";
import { TableCanvasOverlay } from "./table-canvas-overlay";
import type { CanvasStore } from "@leviosa-ai/canvas/store";

/**
 * 표·차트 오버레이를 **우리 엔진** 캔버스 위에 얹는다 (G4).
 *
 * 오버레이 코드는 한 줄도 안 고쳤다. 얼굴 하나(`canvas-store-facade`)와 리렌더 신호만
 * 대 주면 그대로 돈다 — 왜 그런지는 그 파일에 적어 뒀다.
 */

/** 스토어가 바뀔 때마다 새 얼굴. 안 바뀌면 같은 얼굴이라 오버레이도 안 다시 그린다. */
export function useLegacyStore(store: CanvasStore): LegacyStoreFacade {
  const version = useSyncExternalStore(
    store.subscribe,
    () => store.version,
    () => store.version,
  );
  return useMemo(() => legacyStoreFacade(store), [store, version]);
}

export function CanvasOverlayHost({
  store,
  containerRef,
}: {
  store: CanvasStore;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const facade = useLegacyStore(store);
  return (
    <>
      <TableCanvasOverlay store={facade} containerRef={containerRef} />
      <SpecResizeAbsorber store={facade} containerRef={containerRef} />
    </>
  );
}
