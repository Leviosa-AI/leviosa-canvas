import type { DetailDocumentV2 } from "../../../packages/detail-document-next/src";

export const fixture: DetailDocumentV2 = {
  schema_version: "detail-document-v2",
  document_id: "dpnd_lab",
  revision: 1,
  canvas: { width: 750, background: "#f6f1e7" },
  sections: [{
    id: "sec_hero",
    type: "section",
    name: "제품 히어로",
    layout: { mode: "stack", gap: 24, padding: [72, 56] },
    style: { color: "#163b2f" },
    children: [
      {
        id: "txt_eyebrow",
        type: "text",
        content: "LEViosa · DAILY FORMULA",
        style: { fontSize: 16, letterSpacing: 3, fontWeight: 700 },
      },
      {
        id: "txt_title",
        type: "text",
        content: "매일의 피부를\n편안하게",
        style: { fontSize: 64, lineHeight: 1.08, fontWeight: 700 },
      },
      {
        id: "img_product",
        type: "image",
        assetId: "dpna_product",
        alt: "제품 플레이스홀더",
        layout: { width: "100%", height: 520 },
        style: { objectFit: "cover", borderRadius: 28 },
      },
      {
        id: "txt_body",
        type: "text",
        content: "HTML과 CSS가 그대로 편집 가능한 첫 번째 DetailDocument v2 렌더러 실험입니다.",
        style: { fontSize: 24, lineHeight: 1.55 },
      },
    ],
  }],
  assets: {
    dpna_product: {
      kind: "image",
      uri: "asset://placeholder/dpna_product",
      mimeType: "image/svg+xml",
      sha256: "a".repeat(64),
      width: 1600,
      height: 1600,
    },
  },
  metadata: { source: "detail-document-v2-direct" },
};
