import type { DetailDocumentV2, DpnextNode } from "../../detail-document-next/src";

export interface DocumentFontRequest {
  family: string;
  weights: string[];
}

function visit(node: DpnextNode, requests: Map<string, Set<string>>): void {
  const family = typeof node.style?.fontFamily === "string" ? node.style.fontFamily.trim() : "";
  if (family) {
    const weights = requests.get(family) ?? new Set<string>();
    weights.add(String(node.style?.fontWeight ?? "400"));
    for (const mark of node.marks ?? []) {
      if (mark && typeof mark === "object" && !Array.isArray(mark)) {
        const weight = mark.font_weight;
        if (typeof weight === "string" || typeof weight === "number") weights.add(String(weight));
      }
    }
    requests.set(family, weights);
  }
  node.children?.forEach((child) => visit(child, requests));
}

/**
 * Returns the exact families/weights a host must preload before measurement or export.
 * Cardnews hosts must satisfy these requests from the frozen `@leviosa-ai/konva` font bundle;
 * the renderer intentionally never fetches fonts itself.
 */
export function collectDocumentFonts(document: DetailDocumentV2): DocumentFontRequest[] {
  const requests = new Map<string, Set<string>>();
  document.sections.forEach((section) => visit(section, requests));
  return Array.from(requests, ([family, weights]) => ({
    family,
    weights: Array.from(weights).sort((left, right) => Number(left) - Number(right)),
  })).sort((left, right) => left.family.localeCompare(right.family));
}
