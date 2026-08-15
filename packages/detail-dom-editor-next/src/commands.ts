import type {
  DetailDocumentPatchV1,
  DetailDocumentV2,
  DpnextNode,
  DpnextPatchOperation,
  DpnextScalar,
} from "../../detail-document-next/src";
import { validateSvgMarkup } from "../../detail-document-next/src";

export function patchFor(
  document: DetailDocumentV2,
  baseSha256: string,
  operation: DpnextPatchOperation,
  intent: string,
): DetailDocumentPatchV1 {
  return {
    schema_version: "detail-document-patch-v1",
    document_id: document.document_id,
    base_revision: document.revision,
    base_sha256: baseSha256,
    intent,
    operations: [operation],
  };
}

export const replaceText = (document: DetailDocumentV2, sha: string, nodeId: string, value: string) =>
  patchFor(document, sha, { op: "replace_text", node_id: nodeId, value }, "edit text");

export const setStyle = (
  document: DetailDocumentV2,
  sha: string,
  nodeId: string,
  value: Record<string, DpnextScalar>,
) => patchFor(document, sha, { op: "set_style", node_id: nodeId, value }, "edit style");

export const setLayout = (
  document: DetailDocumentV2,
  sha: string,
  nodeId: string,
  value: Record<string, DpnextScalar>,
) => patchFor(document, sha, { op: "set_layout", node_id: nodeId, value }, "transform node");

export const moveBy = (
  document: DetailDocumentV2,
  sha: string,
  nodeId: string,
  x: number,
  y: number,
) => setLayout(document, sha, nodeId, { mode: "absolute", x, y });

export const resizeTo = (
  document: DetailDocumentV2,
  sha: string,
  nodeId: string,
  width: number,
  height: number,
) => setLayout(document, sha, nodeId, { width, height });

export const rotateTo = (
  document: DetailDocumentV2,
  sha: string,
  nodeId: string,
  degrees: number,
) => setStyle(document, sha, nodeId, { transform: `rotate(${degrees}deg)` });

export const replaceAsset = (document: DetailDocumentV2, sha: string, nodeId: string, assetId: string) =>
  patchFor(document, sha, { op: "replace_asset", node_id: nodeId, value: assetId }, "replace image");

export const cropImage = (
  document: DetailDocumentV2,
  sha: string,
  nodeId: string,
  objectPosition: string,
) => {
  if (!/^(-?\d+(?:\.\d+)?%|\b(?:left|center|right)\b)(\s+(-?\d+(?:\.\d+)?%|\b(?:top|center|bottom)\b))?$/.test(objectPosition)) {
    throw new Error("invalid crop objectPosition");
  }
  return setStyle(document, sha, nodeId, { objectFit: "cover", objectPosition });
};

export const replaceSvg = (document: DetailDocumentV2, sha: string, nodeId: string, svg: string) => {
  validateSvgMarkup(svg);
  return patchFor(document, sha, { op: "replace_svg", node_id: nodeId, value: svg }, "replace svg");
};

export const insertNode = (
  document: DetailDocumentV2,
  sha: string,
  parentId: string,
  index: number,
  node: DpnextNode,
) => patchFor(document, sha, { op: "insert_node", parent_id: parentId, index, value: node }, "insert node");

export const moveNode = (
  document: DetailDocumentV2,
  sha: string,
  nodeId: string,
  parentId: string,
  index: number,
) => patchFor(document, sha, { op: "move_node", node_id: nodeId, parent_id: parentId, index }, "move node");

export const removeNode = (document: DetailDocumentV2, sha: string, nodeId: string) =>
  patchFor(document, sha, { op: "remove_node", node_id: nodeId }, "remove node");
