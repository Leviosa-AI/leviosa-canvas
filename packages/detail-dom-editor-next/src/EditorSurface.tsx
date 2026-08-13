import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";

import type { DetailDocumentV2 } from "../../detail-document-next/src";
import { DocumentRenderer, type AssetResolver } from "../../detail-dom-renderer-next/src";
import { nextSelection } from "./selection";
import { SelectionOverlay } from "./SelectionOverlay";

interface EditorSurfaceProps {
  document: DetailDocumentV2;
  resolveAsset?: AssetResolver;
  onSelectionChange?: (nodeIds: string[]) => void;
}

export function EditorSurface({ document, resolveAsset, onSelectionChange }: EditorSurfaceProps) {
  const [selection, setSelection] = useState<string[]>([]);
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
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
    onSelectionChange?.(next);
  };
  return (
    <div ref={surfaceRef} data-dpnext-editor-surface onClick={select} style={{ position: "relative" }}>
      <DocumentRenderer document={document} resolveAsset={resolveAsset} />
      {selectionRect ? <SelectionOverlay rect={selectionRect} /> : null}
      <output aria-label="선택된 레이어">{selection.join(",")}</output>
    </div>
  );
}
