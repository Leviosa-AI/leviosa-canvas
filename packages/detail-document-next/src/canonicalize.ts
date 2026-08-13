import type { DetailDocumentV2, DpnextScalar } from "./types";
import { validateDocument } from "./validate";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value as DpnextScalar;
}

export function canonicalDocument(document: DetailDocumentV2): string {
  validateDocument(document);
  const snapshot = structuredClone(document);
  delete snapshot.revision_sha256;
  return JSON.stringify(stable(snapshot));
}

export async function documentSha256(document: DetailDocumentV2): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalDocument(document));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
