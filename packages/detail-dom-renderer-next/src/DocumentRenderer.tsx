import type { CSSProperties } from "react";

import { validateDocument, type DetailDocumentV2 } from "../../detail-document-next/src";
import type { AssetResolver } from "./assetResolver";
import { placeholderAssetResolver } from "./assetResolver";
import { NodeRenderer } from "./NodeRenderer";

export interface DocumentRendererProps {
  document: DetailDocumentV2;
  resolveAsset?: AssetResolver;
  className?: string;
}

export function DocumentRenderer({
  document,
  resolveAsset = placeholderAssetResolver,
  className,
}: DocumentRendererProps) {
  validateDocument(document);
  const style: CSSProperties = {
    width: document.canvas.width,
    height: document.document_kind === "cardnews" && document.sections.length === 1
      ? document.canvas.height
      : undefined,
    maxWidth: "100%",
    minHeight: 1,
    background: document.canvas.background,
    position: "relative",
    boxSizing: "border-box",
    overflow: "hidden",
  };
  return (
    <main
      className={className}
      data-dpnext-document-id={document.document_id}
      data-dpnext-revision={document.revision}
      style={style}
    >
      {document.sections.map((section) => (
        <NodeRenderer
          key={section.id}
          node={section}
          document={document}
          resolveAsset={resolveAsset}
        />
      ))}
    </main>
  );
}
