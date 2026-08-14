import type { DetailDocumentV2 } from "../../../packages/detail-document-next/src";

export const fixture: DetailDocumentV2 = {
  schema_version: "detail-document-v2",
  document_id: "dpnd_lab",
  revision: 1,
  canvas: { width: 750, background: "#f7f4ee" },
  sections: [
    {
      id: "sec_hero",
      type: "section",
      name: "제품 히어로",
      layout: { mode: "stack", gap: 24, padding: [72, 56] },
      style: { color: "#17362f", background: "#f7f4ee" },
      children: [
        {
          id: "txt_eyebrow",
          type: "text",
          name: "브랜드 라벨",
          content: "LEViosa · DAILY FORMULA",
          style: { fontSize: 16, letterSpacing: 3, fontWeight: 700, color: "#315f52" },
        },
        {
          id: "txt_title",
          type: "text",
          name: "메인 타이틀",
          content: "매일의 피부를\n편안하게",
          style: { fontSize: 64, lineHeight: 1.08, fontWeight: 800 },
          marks: [{ kind: "cardnews_text_highlight", color: "#e5f1d8", radius: 0.24, pad_x: 0.08 }],
        },
        {
          id: "grp_product_card",
          type: "group",
          name: "제품 카드",
          layout: { mode: "overlay", width: "100%", height: 520 },
          style: { borderRadius: 28, overflow: "hidden", background: "#d8e6dc" },
          children: [
            {
              id: "img_product",
              type: "image",
              name: "대표 제품 이미지",
              assetId: "dpna_product",
              alt: "녹색 세럼 병과 크림 튜브가 놓인 제품 이미지",
              layout: { mode: "absolute", x: 0, y: 0, width: "100%", height: 520 },
              style: { objectFit: "cover", objectPosition: "center center" },
            },
            {
              id: "svg_badge",
              type: "svg",
              name: "비건 배지",
              layout: { mode: "absolute", x: 38, y: 34, width: 122, height: 122 },
              svg: "<svg viewBox='0 0 122 122' xmlns='http://www.w3.org/2000/svg' role='img' aria-label='vegan badge'><circle cx='61' cy='61' r='58' fill='#ffffff' opacity='.92'/><path d='M38 67c22 0 37-12 46-35 11 34-4 56-34 56-8 0-15-3-22-8 4-7 7-10 10-13Z' fill='#3c765f'/><text x='61' y='101' text-anchor='middle' font-size='14' font-weight='700' fill='#244538'>VEGAN</text></svg>",
            },
            {
              id: "txt_price",
              type: "text",
              name: "가격 콜아웃",
              content: "런칭 특가 29,000원",
              layout: { mode: "absolute", x: 330, y: 420, width: 300 },
              style: { fontSize: 28, fontWeight: 800, color: "#ffffff", textShadow: "0 2px 12px rgb(0 0 0 / 35%)" },
            },
          ],
        },
        {
          id: "txt_body",
          type: "text",
          name: "히어로 설명",
          content: "보습 장벽을 지키는 성분을 중심으로 구성한 상세페이지 예시입니다. HTML과 CSS 기반 편집, 에셋 교체, SVG 검증, 좌표 기반 변형을 같은 문서 모델로 확인합니다.",
          style: { fontSize: 23, lineHeight: 1.58 },
        },
      ],
    },
    {
      id: "sec_benefits",
      type: "section",
      name: "핵심 포인트",
      layout: { mode: "stack", gap: 20, padding: [44, 56] },
      style: { background: "#ffffff", color: "#1c2a25" },
      children: [
        {
          id: "txt_benefits_title",
          type: "text",
          content: "민감한 날에도 부담 없이",
          style: { fontSize: 38, lineHeight: 1.18, fontWeight: 800 },
        },
        {
          id: "grp_benefit_grid",
          type: "group",
          layout: { mode: "grid", columns: 3, gap: 12 },
          children: [
            { id: "txt_benefit_1", type: "text", content: "장벽 케어", layout: { padding: 18 }, style: { background: "#edf6ef", borderRadius: 12, fontSize: 20, fontWeight: 700 } },
            { id: "txt_benefit_2", type: "text", content: "끈적임 최소화", layout: { padding: 18 }, style: { background: "#f5efe8", borderRadius: 12, fontSize: 20, fontWeight: 700 } },
            { id: "txt_benefit_3", type: "text", content: "재활용 패키지", layout: { padding: 18 }, style: { background: "#eef2f7", borderRadius: 12, fontSize: 20, fontWeight: 700 } },
          ],
        },
        {
          id: "img_texture",
          type: "image",
          name: "제형 이미지",
          assetId: "dpna_texture",
          alt: "손등에 펴 바른 크림 제형",
          layout: { width: "100%", height: 360 },
          style: { objectFit: "cover", objectPosition: "center center", borderRadius: 18 },
        },
      ],
    },
  ],
  assets: {
    dpna_product: {
      kind: "image",
      uri: "asset://placeholder/dpna_product",
      mimeType: "image/svg+xml",
      sha256: "a".repeat(64),
      width: 1600,
      height: 1600,
    },
    dpna_texture: {
      kind: "image",
      uri: "asset://placeholder/dpna_texture",
      mimeType: "image/svg+xml",
      sha256: "b".repeat(64),
      width: 1600,
      height: 900,
    },
  },
  metadata: { source: "detail-document-v2-direct" },
};

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const fixtureAssetUrls: Record<string, string> = {
  dpna_product: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 840">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#d9e7dd"/><stop offset="1" stop-color="#9eb9a9"/>
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
          <stop stop-color="#123e32"/><stop offset=".5" stop-color="#3f7462"/><stop offset="1" stop-color="#102f27"/>
        </linearGradient>
        <filter id="shadow"><feDropShadow dx="0" dy="22" stdDeviation="18" flood-opacity=".28"/></filter>
      </defs>
      <rect width="1200" height="840" fill="url(#bg)"/>
      <circle cx="920" cy="130" r="260" fill="#f7f2e7" opacity=".45"/>
      <ellipse cx="600" cy="718" rx="365" ry="50" fill="#315d4f" opacity=".18"/>
      <g filter="url(#shadow)">
        <rect x="335" y="250" width="250" height="430" rx="34" fill="url(#glass)"/>
        <rect x="382" y="165" width="156" height="112" rx="18" fill="#18362e"/>
        <rect x="365" y="358" width="190" height="178" rx="4" fill="#f6f0e4"/>
        <text x="460" y="407" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="700" fill="#17362f">LEVIOSA</text>
        <text x="460" y="448" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#315f52">DAILY SERUM</text>
        <path d="M685 244h210l52 410c5 35-20 66-55 66H688c-34 0-60-31-55-65Z" fill="#f4eadc"/>
        <rect x="711" y="175" width="158" height="90" rx="18" fill="#d6c4aa"/>
        <text x="790" y="430" text-anchor="middle" font-family="sans-serif" font-size="27" font-weight="700" fill="#244538">LEVIOSA</text>
        <text x="790" y="470" text-anchor="middle" font-family="sans-serif" font-size="17" fill="#52675f">BARRIER CREAM</text>
      </g>
      <path d="M85 725c145-85 210-198 235-337-145 95-230 212-235 337Z" fill="#5d8c70" opacity=".55"/>
    </svg>`),
  dpna_texture: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 640">
      <defs><linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f0c7ae"/><stop offset="1" stop-color="#c99073"/></linearGradient></defs>
      <rect width="1200" height="640" fill="#e9e2d7"/>
      <path d="M80 510c260-170 545-244 1000-196l110 326H0Z" fill="url(#skin)"/>
      <path d="M470 338c85-52 208-66 340-21 50 17 54 70 5 88-126 47-249 49-354 10-47-17-40-49 9-77Z" fill="#faf8ee" opacity=".88"/>
      <path d="M497 355c89-25 185-30 280-8" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" opacity=".9"/>
      <circle cx="1020" cy="130" r="170" fill="#adc1b0" opacity=".42"/>
    </svg>`),
};
