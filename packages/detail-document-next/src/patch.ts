import type { DetailDocumentPatchV1, DetailDocumentV2, DpnextNode } from "./types";
import { validateDocument } from "./validate";

export class DpnextRevisionConflict extends Error {}

const PATCH_OPERATIONS = new Set([
  "replace_text",
  "set_style",
  "set_layout",
  "replace_asset",
  "replace_svg",
  "insert_node",
  "remove_node",
  "move_node",
  "duplicate_node",
  "replace_section",
]);

function locate(nodes: DpnextNode[], nodeId: string): { node: DpnextNode; parent: DpnextNode[]; index: number } | null {
  for (const [index, node] of nodes.entries()) {
    if (node.id === nodeId) return { node, parent: nodes, index };
    const child = locate(node.children ?? [], nodeId);
    if (child) return child;
  }
  return null;
}

export function applyPatch(
  document: DetailDocumentV2,
  patch: DetailDocumentPatchV1,
  currentSha256: string,
  options: { allowUserOwned?: boolean } = {},
): DetailDocumentV2 {
  if (patch.schema_version !== "detail-document-patch-v1") {
    throw new Error("unsupported patch schema");
  }
  if (patch.base_revision !== document.revision || patch.base_sha256 !== currentSha256) {
    throw new DpnextRevisionConflict("stale DetailDocument base");
  }
  if (patch.document_id !== document.document_id) {
    throw new DpnextRevisionConflict("patch targets another DetailDocument");
  }
  const next = structuredClone(document);
  for (const operation of patch.operations) {
    if (!PATCH_OPERATIONS.has(operation.op)) {
      throw new Error(`unsupported patch operation: ${operation.op}`);
    }
    if (operation.op === "insert_node") {
      const target = locate(next.sections, operation.parent_id);
      if (!target) throw new Error(`missing parent: ${operation.parent_id}`);
      target.node.children ??= [];
      target.node.children.splice(operation.index, 0, structuredClone(operation.value));
      continue;
    }
    const target = locate(next.sections, operation.node_id);
    if (!target) throw new Error(`missing node: ${operation.node_id}`);
    if (target.node.metadata?.lastModifiedBy === "user" && !options.allowUserOwned) {
      throw new Error(`user-owned node is protected: ${operation.node_id}`);
    }
    if (operation.op === "remove_node") {
      target.parent.splice(target.index, 1);
    } else if (operation.op === "move_node") {
      const [moving] = target.parent.splice(target.index, 1);
      const parent = locate(next.sections, operation.parent_id);
      if (!parent) throw new Error(`missing parent: ${operation.parent_id}`);
      parent.node.children ??= [];
      parent.node.children.splice(operation.index, 0, moving);
    } else if (operation.op === "replace_text") {
      target.node.content = operation.value;
    } else if (operation.op === "set_style") {
      target.node.style = { ...target.node.style, ...structuredClone(operation.value) };
    } else if (operation.op === "set_layout") {
      target.node.layout = { ...target.node.layout, ...structuredClone(operation.value) };
    } else if (operation.op === "replace_asset") {
      target.node.assetId = operation.value;
    } else if (operation.op === "replace_svg") {
      target.node.svg = operation.value;
    } else if (operation.op === "duplicate_node") {
      const clone = structuredClone(target.node);
      const rewrite = (node: DpnextNode): void => {
        const replacement = operation.value[node.id];
        if (!replacement) throw new Error(`missing duplicate ID for ${node.id}`);
        node.id = replacement;
        node.children?.forEach(rewrite);
      };
      rewrite(clone);
      target.parent.splice(target.index + 1, 0, clone);
    } else if (operation.op === "replace_section") {
      if (target.node.type !== "section" || operation.value.id !== target.node.id) {
        throw new Error("replace_section must preserve a section ID");
      }
      target.parent[target.index] = structuredClone(operation.value);
    }
  }
  next.revision += 1;
  delete next.revision_sha256;
  validateDocument(next);
  return next;
}
