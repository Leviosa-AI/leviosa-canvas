import { useCallback, useEffect, useMemo, useState } from "react";

import {
  applyPatch,
  documentSha256,
  validateDocument,
  type DetailDocumentPatchV1,
  type DetailDocumentV2,
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

  const publish = useCallback((snapshot: EditorSnapshot, selection = state.selection, error: string | null = null) => {
    setState({
      ...cloneSnapshot(snapshot),
      selection,
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
      error,
    });
  }, [history, state.selection]);

  const loadDocument = useCallback(async (document: DetailDocumentV2) => {
    const next = await snapshotFor(document);
    history.replace(next);
    setState({
      ...cloneSnapshot(next),
      selection: [],
      canUndo: false,
      canRedo: false,
      error: null,
    });
  }, [history]);

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

  const applyValidatedPatch = useCallback(async (patch: DetailDocumentPatchV1) => {
    const current = history.current();
    const nextDocument = applyPatch(current.document, patch, current.sha256, { allowUserOwned: true });
    const next = await snapshotFor(nextDocument);
    history.push(next);
    publish(next, state.selection);
    return cloneSnapshot(next);
  }, [history, publish, state.selection]);

  const setSelection = useCallback((nodeIds: string[]) => {
    setState((current) => ({ ...current, selection: [...nodeIds] }));
  }, []);

  const restore = useCallback(async (direction: "undo" | "redo"): Promise<EditorCommit | null> => {
    if (direction === "undo" ? !history.canUndo() : !history.canRedo()) return null;
    const current = history.current();
    const desired = direction === "undo" ? history.undo() : history.redo();
    const patch: DetailDocumentPatchV1 = {
      schema_version: "detail-document-patch-v1",
      document_id: current.document.document_id,
      base_revision: current.document.revision,
      base_sha256: current.sha256,
      intent: direction,
      operations: desired.document.sections.map((section) => ({
        op: "replace_section" as const,
        node_id: section.id,
        value: structuredClone(section),
      })),
    };
    const restored = await snapshotFor(
      applyPatch(current.document, patch, current.sha256, { allowUserOwned: true }),
    );
    history.replacePresent(restored);
    publish(restored);
    return { ...cloneSnapshot(restored), patch };
  }, [history, publish]);

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
