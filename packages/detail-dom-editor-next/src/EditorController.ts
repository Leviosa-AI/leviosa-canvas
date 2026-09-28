// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  applyPatch,
  documentSha256,
  DPNEXT_ROOT_PARENT_ID,
  DpnextRevisionConflict,
  validateDocument,
  type DetailDocumentPatchV1,
  type DetailDocumentV2,
  type DpnextNode,
  type DpnextPatchOperation,
} from "../../detail-document-next/src";
import { History } from "./History";

export interface EditorSnapshot {
  document: DetailDocumentV2;
  sha256: string;
}

export interface EditorControllerState extends EditorSnapshot {
  selection: string[];
  canUndo: boolean;
  canRedo: boolean;
  error: string | null;
}

export interface EditorController {
  state: EditorControllerState;
  ready: boolean;
  loadDocument: (document: DetailDocumentV2) => Promise<void>;
  applyValidatedPatch: (patch: DetailDocumentPatchV1) => Promise<EditorSnapshot>;
  setSelection: (nodeIds: string[]) => void;
  undo: () => Promise<EditorCommit | null>;
  redo: () => Promise<EditorCommit | null>;
}

export interface EditorCommit extends EditorSnapshot {
  patch: DetailDocumentPatchV1;
}

function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return { document: structuredClone(snapshot.document), sha256: snapshot.sha256 };
}

async function snapshotFor(document: DetailDocumentV2): Promise<EditorSnapshot> {
  validateDocument(document);
  const clone = structuredClone(document);
  return { document: clone, sha256: await documentSha256(clone) };
}

// 현재 최상위 섹션 목록을 desired로 되돌리는 연산: 없어진 섹션은 제자리에 다시 넣고, 새로 생긴 섹션은 지운다.
function restoreOperations(current: DpnextNode[], desired: DpnextNode[]): DpnextPatchOperation[] {
  const wanted = new Set(desired.map((section) => section.id));
  const operations: DpnextPatchOperation[] = [];
  const order: string[] = [];
  for (const section of current) {
    if (wanted.has(section.id)) order.push(section.id);
    else operations.push({ op: "remove_node", node_id: section.id });
  }
  desired.forEach((section, index) => {
    const at = order.indexOf(section.id);
    if (at === -1) {
      operations.push({ op: "insert_node", parent_id: DPNEXT_ROOT_PARENT_ID, index, value: structuredClone(section) });
      order.splice(index, 0, section.id);
      return;
    }
    if (at !== index) {
      operations.push({ op: "move_node", node_id: section.id, parent_id: DPNEXT_ROOT_PARENT_ID, index });
      order.splice(at, 1);
      order.splice(index, 0, section.id);
    }
    operations.push({ op: "replace_section", node_id: section.id, value: structuredClone(section) });
  });
  return operations;
}

function shortcutIntent(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey">): "undo" | "redo" | null {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return null;
  return event.shiftKey ? "redo" : "undo";
}

export function isEditorHistoryShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey">): boolean {
  return shortcutIntent(event) !== null;
}

export function editorHistoryIntent(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey">,
): "undo" | "redo" | null {
  return shortcutIntent(event);
}

export function useEditorController(initialDocument: DetailDocumentV2): EditorController {
  const initial = useMemo<EditorSnapshot>(() => ({ document: structuredClone(initialDocument), sha256: "" }), [initialDocument]);
  const [history] = useState(() => new History<EditorSnapshot>(initial, cloneSnapshot));
  const [state, setState] = useState<EditorControllerState>({
    ...cloneSnapshot(initial),
    selection: [],
    canUndo: false,
    canRedo: false,
    error: null,
  });

  // 커밋·undo·redo·load를 한 줄로 세워, 비동기 SHA 계산 사이에 다른 커밋이 끼어들지 못하게 한다.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const serial = useCallback(<T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task, task);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  // 적용 직전에 기준 문서가 그대로인지 다시 확인한다.
  const assertBase = useCallback((base: EditorSnapshot) => {
    const present = history.current();
    if (present.sha256 !== base.sha256 || present.document.revision !== base.document.revision) {
      throw new DpnextRevisionConflict("DetailDocument changed during commit");
    }
  }, [history]);

  const publish = useCallback((snapshot: EditorSnapshot) => {
    setState((current) => ({
      ...cloneSnapshot(snapshot),
      selection: current.selection,
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
      error: null,
    }));
  }, [history]);

  const loadDocument = useCallback((document: DetailDocumentV2) => serial(async () => {
    const next = await snapshotFor(document);
    history.replace(next);
    setState({
      ...cloneSnapshot(next),
      selection: [],
      canUndo: false,
      canRedo: false,
      error: null,
    });
  }), [history, serial]);

  useEffect(() => {
    let cancelled = false;
    void snapshotFor(initialDocument).then((next) => {
      if (cancelled) return;
      history.replace(next);
      setState((current) => ({
        ...cloneSnapshot(next),
        selection: current.selection,
        canUndo: false,
        canRedo: false,
        error: null,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [history, initialDocument]);

  const applyValidatedPatch = useCallback((patch: DetailDocumentPatchV1) => serial(async () => {
    const current = history.current();
    const nextDocument = applyPatch(current.document, patch, current.sha256, { allowUserOwned: true });
    const next = await snapshotFor(nextDocument);
    assertBase(current);
    history.push(next);
    publish(next);
    return cloneSnapshot(next);
  }), [assertBase, history, publish, serial]);

  const setSelection = useCallback((nodeIds: string[]) => {
    setState((current) => ({ ...current, selection: [...nodeIds] }));
  }, []);

  const restore = useCallback((direction: "undo" | "redo") => serial(async (): Promise<EditorCommit | null> => {
    const desired = history.peek(direction);
    if (!desired) return null;
    const current = history.current();
    const patch: DetailDocumentPatchV1 = {
      schema_version: "detail-document-patch-v1",
      document_id: current.document.document_id,
      base_revision: current.document.revision,
      base_sha256: current.sha256,
      intent: direction,
      operations: restoreOperations(current.document.sections, desired.document.sections),
    };
    const restored = await snapshotFor(
      applyPatch(current.document, patch, current.sha256, { allowUserOwned: true }),
    );
    assertBase(current);
    // 복원이 성공한 뒤에만 커서를 옮긴다.
    if (direction === "undo") history.undo();
    else history.redo();
    history.replacePresent(restored);
    publish(restored);
    return { ...cloneSnapshot(restored), patch };
  }), [assertBase, history, publish, serial]);

  const undo = useCallback(() => restore("undo"), [restore]);
  const redo = useCallback(() => restore("redo"), [restore]);

  return useMemo(() => ({
    state,
    ready: state.sha256.length === 64,
    loadDocument,
    applyValidatedPatch,
    setSelection,
    undo,
    redo,
  }), [applyValidatedPatch, loadDocument, redo, setSelection, state, undo]);
}
