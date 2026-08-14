import type { DetailDocumentPatchV1, DetailDocumentV2 } from "../../../packages/detail-document-next/src";

export const DPNEXT_LAB_PROTOCOL = "leviosa-detail-page-next-lab-v1" as const;

export type DpnextLabParentMessage = {
  protocol: typeof DPNEXT_LAB_PROTOCOL;
  type: "load-document";
  document: DetailDocumentV2;
};

export type DpnextLabMessage =
  | { protocol: typeof DPNEXT_LAB_PROTOCOL; type: "ready" }
  | { protocol: typeof DPNEXT_LAB_PROTOCOL; type: "selection"; nodeIds: string[] }
  | { protocol: typeof DPNEXT_LAB_PROTOCOL; type: "patch"; patch: DetailDocumentPatchV1; nodeIds: string[] }
  | { protocol: typeof DPNEXT_LAB_PROTOCOL; type: "error"; message: string };

export function isDpnextLabParentMessage(value: unknown): value is DpnextLabParentMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<DpnextLabParentMessage>;
  return (
    message.protocol === DPNEXT_LAB_PROTOCOL &&
    message.type === "load-document" &&
    Boolean(message.document && typeof message.document === "object")
  );
}
