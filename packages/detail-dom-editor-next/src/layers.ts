import type { DpnextNode } from "../../detail-document-next/src";

export interface LayerEntry {
  id: string;
  type: string;
  depth: number;
}

export function layerTree(nodes: readonly DpnextNode[], depth = 0): LayerEntry[] {
  return nodes.flatMap((node) => [
    { id: node.id, type: node.type, depth },
    ...layerTree(node.children ?? [], depth + 1),
  ]);
}

export function cloneWithFreshIds(node: DpnextNode, suffix: string): DpnextNode {
  const clone = structuredClone(node);
  const rewrite = (candidate: DpnextNode): void => {
    candidate.id = `${candidate.id}__${suffix}`;
    candidate.children?.forEach(rewrite);
  };
  rewrite(clone);
  return clone;
}
