import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import type { DetailDocumentPatchV1, DetailDocumentV2, DpnextNode } from "../../detail-document-next/src";
import { DocumentRenderer, type AssetResolver } from "../../detail-dom-renderer-next/src";
import { moveBy, replaceText, resizeTo } from "./commands";
import { nextSelection } from "./selection";
import { SelectionOverlay } from "./SelectionOverlay";
import { TextEditor } from "./TextEditor";
import { TransformOverlay } from "./TransformOverlay";

interface EditorSurfaceProps {
  document: DetailDocumentV2;
  sha256?: string;
  zoom?: number;
  resolveAsset?: AssetResolver;
  onSelectionChange?: (nodeIds: string[]) => void;
  onPatch?: (patch: DetailDocumentPatchV1) => void;
}

function findNode(nodes: DpnextNode[], nodeId: string): DpnextNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const child = findNode(node.children ?? [], nodeId);
    if (child) return child;
  }
  return null;
}

function numberFromLayout(node: DpnextNode | null, key: "x" | "y" | "width" | "height", fallback: number): number {
  const value = node?.layout?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function EditorSurface({ document, sha256 = "", zoom = 1, resolveAsset, onSelectionChange, onPatch }: EditorSurfaceProps) {
  const [selection, setSelection] = useState<string[]>([]);
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const selectedNode = useMemo(() => selection.at(-1) ? findNode(document.sections, selection.at(-1)!) : null, [document, selection]);
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const selectedId = selection.at(-1);
    if (!surface || !selectedId) {
      setSelectionRect(null);
      return;
    }
    const selected = [...surface.querySelectorAll<HTMLElement>("[data-dpnext-node-id]")].find(
      (element) => element.dataset.dpnextNodeId === selectedId,
    );
    if (!selected) {
      setSelectionRect(null);
      return;
    }
    const bounds = selected.getBoundingClientRect();
    const surfaceBounds = surface.getBoundingClientRect();
    setSelectionRect(
      new DOMRect(
        bounds.left - surfaceBounds.left + surface.scrollLeft,
        bounds.top - surfaceBounds.top + surface.scrollTop,
        bounds.width,
        bounds.height,
      ),
    );
  }, [document, selection]);
  const select = (event: MouseEvent<HTMLElement>) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-dpnext-node-id]");
    if (!element) return;
    event.stopPropagation();
    const next = nextSelection(selection, element.dataset.dpnextNodeId!, event.shiftKey);
    setSelection(next);
    setEditingTextId(null);
    onSelectionChange?.(next);
  };
  const edit = (event: MouseEvent<HTMLElement>) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-dpnext-node-id]");
    if (!element) return;
    const node = findNode(document.sections, element.dataset.dpnextNodeId!);
    if (node?.type === "text") {
      event.preventDefault();
      event.stopPropagation();
      setSelection([node.id]);
      setEditingTextId(node.id);
      onSelectionChange?.([node.id]);
    }
  };
  const emitMove = (deltaX: number, deltaY: number) => {
    if (!selectedNode || !selectionRect || !sha256) return;
    const currentX = numberFromLayout(selectedNode, "x", selectionRect.left / zoom);
    const currentY = numberFromLayout(selectedNode, "y", selectionRect.top / zoom);
    onPatch?.(moveBy(document, sha256, selectedNode.id, Math.round(currentX + deltaX), Math.round(currentY + deltaY)));
  };
  const emitResize = (width: number, height: number) => {
    if (!selectedNode || !sha256) return;
    onPatch?.(resizeTo(document, sha256, selectedNode.id, Math.round(width), Math.round(height)));
  };
  const textRect = selectionRect && selectedNode?.type === "text" && editingTextId === selectedNode.id
    ? {
      position: "absolute" as const,
      left: selectionRect.left,
      top: selectionRect.top,
      width: Math.max(80, selectionRect.width),
      minHeight: Math.max(32, selectionRect.height),
      zIndex: 10002,
      background: "rgb(255 255 255 / 92%)",
      outline: `${1 / zoom}px solid #635bff`,
    }
    : null;
  return (
    <div ref={surfaceRef} data-dpnext-editor-surface onClick={select} onDoubleClick={edit} style={{ position: "relative" }}>
      <DocumentRenderer document={document} resolveAsset={resolveAsset} />
      {selectionRect && !onPatch ? <SelectionOverlay rect={selectionRect} zoom={zoom} /> : null}
      {selectionRect && selectedNode && onPatch ? (
        <TransformOverlay rect={selectionRect} zoom={zoom} onMove={emitMove} onResize={emitResize} />
      ) : null}
      {textRect && selectedNode?.type === "text" && sha256 ? (
        <div style={textRect}>
          <TextEditor
            value={selectedNode.content ?? ""}
            aria-label={`${selectedNode.name || selectedNode.id} 인라인 편집`}
            onCommit={(value) => onPatch?.(replaceText(document, sha256, selectedNode.id, value))}
          />
        </div>
      ) : null}
      <output aria-label="선택된 레이어">{selection.join(",")}</output>
    </div>
  );
}
