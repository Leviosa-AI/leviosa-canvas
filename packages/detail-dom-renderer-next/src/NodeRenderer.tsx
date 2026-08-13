import type { CSSProperties, ReactNode } from "react";

import type { DetailDocumentV2, DpnextNode } from "../../detail-document-next/src";
import type { AssetResolver } from "./assetResolver";
import { styleToCss } from "./styleToCss";

interface NodeRendererProps {
  node: DpnextNode;
  document: DetailDocumentV2;
  resolveAsset: AssetResolver;
}

function children(node: DpnextNode, document: DetailDocumentV2, resolveAsset: AssetResolver): ReactNode {
  return node.children?.map((child) => (
    <NodeRenderer key={child.id} node={child} document={document} resolveAsset={resolveAsset} />
  ));
}

function common(node: DpnextNode): { "data-dpnext-node-id": string; "data-dpnext-node-type": string; style: CSSProperties } {
  return {
    "data-dpnext-node-id": node.id,
    "data-dpnext-node-type": node.type,
    style: styleToCss(node.layout, node.style),
  };
}

export function NodeRenderer({ node, document, resolveAsset }: NodeRendererProps) {
  const props = common(node);
  if (node.type === "text") return <div {...props}>{node.content}</div>;
  if (node.type === "image") {
    const asset = document.assets[node.assetId!];
    return <img {...props} src={resolveAsset(node.assetId!, asset)} alt={node.alt ?? ""} draggable={false} />;
  }
  if (node.type === "svg") {
    return <div {...props} aria-label={node.name} dangerouslySetInnerHTML={{ __html: node.svg ?? "" }} />;
  }
  if (node.type === "shape") return <div {...props} aria-label={node.name} />;
  if (node.type === "divider") return <hr {...props} />;
  if (node.type === "section") {
    return <section {...props} aria-label={node.name}>{children(node, document, resolveAsset)}</section>;
  }
  return <div {...props}>{children(node, document, resolveAsset)}</div>;
}
