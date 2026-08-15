import {
  validateDocument,
  validatePatch,
  type DetailDocumentPatchV1,
  type DetailDocumentV2,
} from "../../../packages/detail-document-next/src";

export const DPNEXT_LAB_PROTOCOL = "leviosa-detail-page-next-lab-v1" as const;
export const DPNEXT_LAB_PROTOCOL_VERSION = 1 as const;

export type DpnextLabMessageType = "ready" | "load-document" | "selection" | "patch" | "error";

export interface DpnextLabEnvelope {
  protocol: typeof DPNEXT_LAB_PROTOCOL;
  version: typeof DPNEXT_LAB_PROTOCOL_VERSION;
  sessionNonce: string;
  type: DpnextLabMessageType;
}

export type DpnextLabParentMessage = DpnextLabEnvelope & {
  type: "load-document";
  document: DetailDocumentV2;
  assetUrls?: Record<string, string>;
};

export type DpnextLabMessage =
  | (DpnextLabEnvelope & { type: "ready" })
  | (DpnextLabEnvelope & { type: "selection"; nodeIds: string[] })
  | (DpnextLabEnvelope & { type: "patch"; patch: DetailDocumentPatchV1; nodeIds: string[] })
  | (DpnextLabEnvelope & { type: "error"; message: string });

export function createDpnextSessionNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasEnvelope(value: unknown, sessionNonce?: string): value is DpnextLabEnvelope {
  if (!isRecord(value)) return false;
  if (value.protocol !== DPNEXT_LAB_PROTOCOL || value.version !== DPNEXT_LAB_PROTOCOL_VERSION) return false;
  if (typeof value.sessionNonce !== "string" || value.sessionNonce.length < 16) return false;
  return !sessionNonce || value.sessionNonce === sessionNonce;
}

function validNodeIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((nodeId) => typeof nodeId === "string" && nodeId.trim().length > 0);
}

export function isDpnextLabParentMessage(value: unknown, sessionNonce?: string): value is DpnextLabParentMessage {
  if (!hasEnvelope(value, sessionNonce) || value.type !== "load-document") return false;
  const message = value as Partial<DpnextLabParentMessage>;
  try {
    validateDocument(message.document as DetailDocumentV2);
  } catch {
    return false;
  }
  return message.assetUrls === undefined || isRecord(message.assetUrls);
}

export function isDpnextLabChildMessage(value: unknown, sessionNonce?: string): value is DpnextLabMessage {
  if (!hasEnvelope(value, sessionNonce)) return false;
  if (value.type === "ready") return true;
  if (value.type === "selection") return validNodeIds((value as { nodeIds?: unknown }).nodeIds);
  if (value.type === "error") return typeof (value as { message?: unknown }).message === "string";
  if (value.type === "patch") {
    const message = value as { patch?: DetailDocumentPatchV1; nodeIds?: unknown };
    try {
      validatePatch(message.patch as DetailDocumentPatchV1);
    } catch {
      return false;
    }
    return validNodeIds(message.nodeIds);
  }
  return false;
}

export function trustedDpnextMessage(
  event: MessageEvent,
  expected: { source: Window | null; origin: string; sessionNonce: string },
): DpnextLabParentMessage | null {
  if (event.source !== expected.source || event.origin !== expected.origin) return null;
  return isDpnextLabParentMessage(event.data, expected.sessionNonce) ? event.data : null;
}
