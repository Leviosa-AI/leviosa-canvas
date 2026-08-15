import type { DetailDocumentPatchV1, DetailDocumentV2, DpnextNode, DpnextPatchOperation } from "./types";

const NODE_TYPES = new Set([
  "section",
  "frame",
  "group",
  "text",
  "image",
  "video",
  "svg",
  "shape",
  "particles",
  "divider",
]);
const FORBIDDEN_SVG = /<\s*script\b|<\s*foreignObject\b|\son[a-z]+\s*=|javascript:|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|data:)/i;
const FORBIDDEN_STYLE_VALUE = /(?:url|image-set)\s*\(|expression\s*\(|javascript:|@import/i;
const SHA256 = /^[0-9a-f]{64}$/;

function validateSafeScalars(value: unknown, path: string): void {
  if (typeof value === "string" && FORBIDDEN_STYLE_VALUE.test(value)) {
    fail("DPNEXT-STYLE-002", path, "external or executable CSS is not allowed");
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSafeScalars(item, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => validateSafeScalars(item, `${path}.${key}`));
  }
}

export class DpnextValidationError extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
    message: string,
  ) {
    super(`${code} at ${path}: ${message}`);
  }
}

function containsUnsafeSvgUrl(svg: string): boolean {
  const normalized = svg.toLowerCase();
  let searchFrom = 0;
  while (searchFrom < normalized.length) {
    const urlStart = normalized.indexOf("url(", searchFrom);
    if (urlStart === -1) return false;
    let cursor = urlStart + 4;
    while (cursor < normalized.length && /\s/u.test(normalized[cursor])) cursor += 1;
    if (normalized[cursor] === '"' || normalized[cursor] === "'") {
      cursor += 1;
      while (cursor < normalized.length && /\s/u.test(normalized[cursor])) cursor += 1;
    }
    if (
      normalized.startsWith("http:", cursor)
      || normalized.startsWith("https:", cursor)
      || normalized.startsWith("//", cursor)
      || normalized.startsWith("javascript:", cursor)
      || normalized.startsWith("data:", cursor)
    ) {
      return true;
    }
    searchFrom = urlStart + 4;
  }
  return false;
}

function fail(code: string, path: string, message: string): never {
  throw new DpnextValidationError(code, path, message);
}

export function validateSvgMarkup(svg: string, path = "$.svg"): void {
  if (!svg.startsWith("<svg") || FORBIDDEN_SVG.test(svg) || containsUnsafeSvgUrl(svg)) {
    fail("DPNEXT-SVG-002", path, "unsafe SVG");
  }
}

function validateNode(
  node: DpnextNode,
  path: string,
  document: DetailDocumentV2,
  ids: Set<string>,
  depth: number,
): void {
  if (depth > 64) fail("DPNEXT-LIMIT-003", path, "tree is too deep");
  if (!node || typeof node !== "object") fail("DPNEXT-SCHEMA-001", path, "node must be an object");
  if (!node.id?.trim() || ids.has(node.id)) fail("DPNEXT-SCHEMA-005", `${path}.id`, "node ID is empty or duplicated");
  ids.add(node.id);
  if (!NODE_TYPES.has(node.type)) fail("DPNEXT-SCHEMA-006", `${path}.type`, "unknown node type");
  validateSafeScalars(node.style, `${path}.style`);
  validateSafeScalars(node.layout, `${path}.layout`);
  validateSafeScalars(node.metadata, `${path}.metadata`);
  if (node.type === "text" && typeof node.content !== "string") {
    fail("DPNEXT-SCHEMA-001", `${path}.content`, "text content must be a string");
  }
  if (node.type === "image" || node.type === "video") {
    if (!node.assetId || !document.assets[node.assetId]) {
      fail("DPNEXT-ASSET-007", `${path}.assetId`, "referenced asset does not exist");
    }
    if (typeof node.alt !== "string") fail("DPNEXT-A11Y-001", `${path}.alt`, "media alt must be a string");
    const asset = document.assets[node.assetId];
    const expected = node.type === "video" ? "video" : "image";
    if (asset.kind !== expected && !(node.type === "image" && asset.kind === "gif")) {
      fail("DPNEXT-ASSET-008", `${path}.assetId`, "media node and asset kind disagree");
    }
  }
  if (node.type === "svg") {
    if (typeof node.svg !== "string") fail("DPNEXT-SVG-002", `${path}.svg`, "unsafe SVG");
    validateSvgMarkup(node.svg, `${path}.svg`);
  }
  if (node.type === "particles" && (!node.particles || typeof node.particles !== "object")) {
    fail("DPNEXT-SCHEMA-001", `${path}.particles`, "particles must be an object");
  }
  for (const [index, child] of (node.children ?? []).entries()) {
    validateNode(child, `${path}.children[${index}]`, document, ids, depth + 1);
  }
}

export function validateDocument(document: DetailDocumentV2): void {
  if (!document || typeof document !== "object") fail("DPNEXT-SCHEMA-001", "$", "document must be an object");
  if (document.schema_version !== "detail-document-v2") fail("DPNEXT-SCHEMA-009", "$.schema_version", "unsupported schema");
  if (!document.document_id?.startsWith("dpnd_")) fail("DPNEXT-SCHEMA-010", "$.document_id", "invalid namespace");
  if (!Number.isInteger(document.revision) || document.revision < 0) fail("DPNEXT-SCHEMA-011", "$.revision", "invalid revision");
  if (!Number.isInteger(document.canvas?.width) || document.canvas.width < 1) fail("DPNEXT-LAYOUT-001", "$.canvas.width", "invalid width");
  if (document.canvas.height !== undefined && (!Number.isInteger(document.canvas.height) || document.canvas.height < 1)) {
    fail("DPNEXT-LAYOUT-001", "$.canvas.height", "invalid height");
  }
  if (document.document_kind !== undefined && !["brand_detail", "seller_archetype", "cardnews"].includes(document.document_kind)) {
    fail("DPNEXT-SCHEMA-016", "$.document_kind", "unknown document kind");
  }
  if (!Array.isArray(document.sections) || document.sections.length === 0) fail("DPNEXT-SCHEMA-002", "$.sections", "sections are required");
  if (!document.assets || typeof document.assets !== "object") fail("DPNEXT-SCHEMA-001", "$.assets", "assets are required");
  for (const [assetId, asset] of Object.entries(document.assets)) {
    if (!asset.uri.match(/^(s3|asset):\/\//)) fail("DPNEXT-ASSET-002", `$.assets.${assetId}.uri`, "unsafe asset URI");
    if (!asset.sha256.match(SHA256)) fail("DPNEXT-ASSET-004", `$.assets.${assetId}.sha256`, "invalid hash");
  }
  validateSafeScalars(document.theme, "$.theme");
  validateSafeScalars(document.metadata, "$.metadata");
  const ids = new Set<string>();
  for (const [index, section] of document.sections.entries()) {
    validateNode(section, `$.sections[${index}]`, document, ids, 0);
  }
}

function validateNodePayload(node: DpnextNode, path: string): void {
  const document: DetailDocumentV2 = {
    schema_version: "detail-document-v2",
    document_id: "dpnd_patch_payload",
    revision: 0,
    canvas: { width: 1 },
    sections: [node.type === "section" ? node : { id: "sec_patch_payload", type: "section", children: [node] }],
    assets: {},
  };
  const collectAssets = (current: DpnextNode): void => {
    if ((current.type === "image" || current.type === "video") && current.assetId) {
      document.assets[current.assetId] = {
        kind: current.type,
        uri: `asset://placeholder/${current.assetId}`,
        mimeType: current.type === "video" ? "video/mp4" : "image/png",
        sha256: "0".repeat(64),
      };
    }
    current.children?.forEach(collectAssets);
  };
  collectAssets(node);
  try {
    validateDocument(document);
  } catch (cause) {
    if (cause instanceof DpnextValidationError) {
      fail(cause.code, `${path}${cause.path.replace("$", "")}`, cause.message);
    }
    throw cause;
  }
}

function validateOperation(operation: DpnextPatchOperation, path: string): void {
  if (!operation || typeof operation !== "object") fail("DPNEXT-PATCH-001", path, "operation must be an object");
  if (operation.op === "replace_text") {
    if (!operation.node_id || typeof operation.value !== "string") fail("DPNEXT-PATCH-002", path, "invalid replace_text operation");
  } else if (operation.op === "set_style" || operation.op === "set_layout") {
    if (!operation.node_id || !operation.value || typeof operation.value !== "object" || Array.isArray(operation.value)) {
      fail("DPNEXT-PATCH-002", path, `invalid ${operation.op} operation`);
    }
    validateSafeScalars(operation.value, `${path}.value`);
  } else if (operation.op === "replace_asset") {
    if (!operation.node_id || typeof operation.value !== "string" || !operation.value.trim()) {
      fail("DPNEXT-PATCH-002", path, "invalid replace_asset operation");
    }
  } else if (operation.op === "replace_svg") {
    if (!operation.node_id || typeof operation.value !== "string") fail("DPNEXT-PATCH-002", path, "invalid replace_svg operation");
    validateSvgMarkup(operation.value, `${path}.value`);
  } else if (operation.op === "insert_node") {
    if (!operation.parent_id || !Number.isInteger(operation.index) || operation.index < 0) {
      fail("DPNEXT-PATCH-002", path, "invalid insert_node operation");
    }
    validateNodePayload(operation.value, `${path}.value`);
  } else if (operation.op === "remove_node") {
    if (!operation.node_id) fail("DPNEXT-PATCH-002", path, "invalid remove_node operation");
  } else if (operation.op === "move_node") {
    if (!operation.node_id || !operation.parent_id || !Number.isInteger(operation.index) || operation.index < 0) {
      fail("DPNEXT-PATCH-002", path, "invalid move_node operation");
    }
  } else if (operation.op === "duplicate_node") {
    if (!operation.node_id || !operation.value || typeof operation.value !== "object" || Array.isArray(operation.value)) {
      fail("DPNEXT-PATCH-002", path, "invalid duplicate_node operation");
    }
  } else if (operation.op === "replace_section") {
    if (!operation.node_id || operation.value?.type !== "section") fail("DPNEXT-PATCH-002", path, "invalid replace_section operation");
    validateNodePayload(operation.value, `${path}.value`);
  } else {
    fail("DPNEXT-PATCH-003", path, "unsupported patch operation");
  }
}

export function validatePatch(patch: DetailDocumentPatchV1): void {
  if (!patch || typeof patch !== "object") fail("DPNEXT-PATCH-001", "$", "patch must be an object");
  if (patch.schema_version !== "detail-document-patch-v1") fail("DPNEXT-PATCH-004", "$.schema_version", "unsupported patch schema");
  if (!patch.document_id?.startsWith("dpnd_")) fail("DPNEXT-PATCH-005", "$.document_id", "invalid document namespace");
  if (!Number.isInteger(patch.base_revision) || patch.base_revision < 0) fail("DPNEXT-PATCH-006", "$.base_revision", "invalid base revision");
  if (!SHA256.test(patch.base_sha256)) fail("DPNEXT-PATCH-007", "$.base_sha256", "invalid base hash");
  if (!Array.isArray(patch.operations) || patch.operations.length === 0) fail("DPNEXT-PATCH-008", "$.operations", "operations are required");
  patch.operations.forEach((operation, index) => validateOperation(operation, `$.operations[${index}]`));
}
