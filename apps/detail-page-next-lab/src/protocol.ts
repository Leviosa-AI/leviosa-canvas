// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import {
  validateDocument,
  validatePatch,
  type DetailDocumentPatchV1,
  type DetailDocumentV2,
} from "../../../packages/detail-document-next/src";

export const DPNEXT_LAB_PROTOCOL = "leviosa-detail-page-next-lab-v1" as const;
export const DPNEXT_LAB_PROTOCOL_VERSION = 1 as const;

export type DpnextLabMessageType = "ready" | "load-document" | "save-request" | "selection" | "patch" | "dirty" | "error";

export interface DpnextLabEnvelope {
  protocol: typeof DPNEXT_LAB_PROTOCOL;
  version: typeof DPNEXT_LAB_PROTOCOL_VERSION;
  sessionNonce: string;
  type: DpnextLabMessageType;
}

export type DpnextLabParentMessage =
  | (DpnextLabEnvelope & {
    type: "load-document";
    document: DetailDocumentV2;
    assetUrls?: Record<string, string>;
  })
  | (DpnextLabEnvelope & { type: "save-request" });

export type DpnextLabMessage =
  | (DpnextLabEnvelope & { type: "ready" })
  | (DpnextLabEnvelope & { type: "selection"; nodeIds: string[] })
  | (DpnextLabEnvelope & { type: "patch"; patch: DetailDocumentPatchV1; nodeIds: string[] })
  // dirty: 마지막 load-document·save-request 이후 편집이 있는지와 그 시점 revision/SHA.
  | (DpnextLabEnvelope & { type: "dirty"; dirty: boolean; revision: number; sha256: string })
  | (DpnextLabEnvelope & { type: "error"; message: string });

export function createDpnextSessionNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isDpnextSessionNonce(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16;
}

// nonce 는 필수다. 기대 nonce 가 없거나 다르면 거절한다.
function hasEnvelope(value: unknown, sessionNonce: string): value is DpnextLabEnvelope {
  if (!isRecord(value) || !isDpnextSessionNonce(sessionNonce)) return false;
  if (value.protocol !== DPNEXT_LAB_PROTOCOL || value.version !== DPNEXT_LAB_PROTOCOL_VERSION) return false;
  return value.sessionNonce === sessionNonce;
}

// ?parentOrigins=https://a.example,https://b.example 로 허용할 상위 창 origin 을 받는다. 없으면 같은 origin 만.
export function allowedParentOrigins(query: URLSearchParams, selfOrigin: string): string[] {
  const origins = (query.get("parentOrigins") ?? "").split(",").map((origin) => origin.trim()).filter((origin) => {
    try {
      return new URL(origin).origin === origin;
    } catch {
      return false;
    }
  });
  return origins.length ? origins : [selfOrigin];
}

function validNodeIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((nodeId) => typeof nodeId === "string" && nodeId.trim().length > 0);
}

export function isDpnextLabParentMessage(value: unknown, sessionNonce: string): value is DpnextLabParentMessage {
  if (!hasEnvelope(value, sessionNonce)) return false;
  if (value.type === "save-request") return true;
  if (value.type !== "load-document") return false;
  const message = value as Partial<Extract<DpnextLabParentMessage, { type: "load-document" }>>;
  try {
    validateDocument(message.document as DetailDocumentV2);
  } catch {
    return false;
  }
  return message.assetUrls === undefined || isRecord(message.assetUrls);
}

export function isDpnextLabChildMessage(value: unknown, sessionNonce: string): value is DpnextLabMessage {
  if (!hasEnvelope(value, sessionNonce)) return false;
  if (value.type === "ready") return true;
  if (value.type === "dirty") {
    const message = value as { dirty?: unknown; revision?: unknown; sha256?: unknown };
    return typeof message.dirty === "boolean"
      && Number.isInteger(message.revision)
      && typeof message.sha256 === "string";
  }
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
  expected: { source: Window | null; origins: readonly string[]; sessionNonce: string },
): DpnextLabParentMessage | null {
  if (event.source !== expected.source || !expected.origins.includes(event.origin)) return null;
  return isDpnextLabParentMessage(event.data, expected.sessionNonce) ? event.data : null;
}
