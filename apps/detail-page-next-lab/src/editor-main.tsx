// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
/**
 * 편집기 셸을 가짜 호스트로 띄워 손으로 눌러 보는 자리. `vite.editor.config.ts` 로 연다.
 *
 * 서버가 없다 — 저장은 콘솔에 찍고, 업로드는 object URL 이고, 브랜드 자산은 빈 목록이다.
 * Tailwind 는 브라우저 빌드(CDN)로 돌린다. 이 저장소에 Tailwind 가 안 깔려 있어서다.
 */
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import {
  DetailPageEditor,
  DetailPageHostProvider,
  type DetailPageHost,
} from "../../../packages/detail-page-editor";
import { registerDetailPageEditorTranslations } from "../../../packages/detail-page-editor/i18n";
import type { LeviosaCanvasDocument } from "../../../packages/detail-page-editor/types/detail-page-canvas";
import tokensCss from "../../../packages/detail-page-editor/styles/tokens.css?raw";
import bridgeCss from "../../../packages/detail-page-editor/styles/canvas-bridge.css?raw";

// ── Tailwind (브라우저 빌드) ───────────────────────────────────
const twStyle = document.createElement("style");
twStyle.type = "text/tailwindcss";
twStyle.textContent = `@import "tailwindcss";\n${tokensCss}\n${bridgeCss}`;
document.head.appendChild(twStyle);
const twScript = document.createElement("script");
twScript.src = "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4";
document.head.appendChild(twScript);

// ── i18n ─────────────────────────────────────────────────────
void i18next.use(initReactI18next).init({
  lng: "ko",
  fallbackLng: "en",
  resources: {},
  interpolation: { escapeValue: false },
  // init 이 비동기라 첫 렌더에서 useTranslation 이 Suspense 를 던진다 — 경계가 없으니 끈다.
  react: { useSuspense: false },
});
registerDetailPageEditorTranslations(i18next);

// ── 가짜 호스트 ────────────────────────────────────────────────
/** 안 채운 이름은 빈 결과를 돌려주는 async 함수가 된다. */
function autoStub<T extends object>(overrides: Partial<T>): T {
  return new Proxy({ ...overrides } as Record<string, unknown>, {
    get(target, key) {
      if (typeof key !== "string" || key === "then") return undefined;
      if (key in target) return target[key];
      return async () => [];
    },
  }) as T;
}
function keyPath(path: string[] = []): never {
  const fn = (...args: unknown[]) => [...path, ...args];
  return new Proxy(fn, {
    get: (_t, key) => (typeof key === "string" ? keyPath([...path, key]) : undefined),
  }) as never;
}

const toasts: string[] = [];
let renderToasts: (() => void) | null = null;
function toast(kind: string, message: string) {
  console.log(`[toast:${kind}]`, message);
  toasts.push(`${kind}: ${message}`);
  renderToasts?.();
}

const brand = {
  id: "b1",
  name: "데모 브랜드",
  ownedCompanyId: "c1",
  revision: 1,
};
const host: DetailPageHost = {
  api: autoStub({
    asEditQuotaError: () => null,
    asInsufficientCreditsError: () => null,
  }),
  brand: autoStub({
    listBrandAssets: async () => [],
    brandAssetDocumentSrc: (a: { download_url: string | null; stable_path: string }) =>
      a.download_url ?? a.stable_path,
    useBrandWorkspace: () => ({
      brands: [brand],
      activeBrand: brand,
      activeBrandId: brand.id,
      setActiveBrandId: () => {},
      isLoading: false,
      error: null,
    }),
    getStoredActiveBrandId: () => brand.id,
    useBrandPrimaryColor: () => "#111111",
  }),
  product: autoStub({}),
  toast: {
    success: (m) => toast("success", m),
    error: (m) => toast("error", m),
    info: (m) => toast("info", m),
  },
  queryKeys: keyPath(),
};

// ── 샘플 문서 ─────────────────────────────────────────────────
function swatch(color: string, w = 400, h = 300): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,255,255,.6)";
  g.beginPath();
  g.arc(w * 0.35, h * 0.45, Math.min(w, h) * 0.25, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = "bold 28px sans-serif";
  g.fillText(color, 16, h - 20);
  return c.toDataURL("image/png");
}

const W = 860;
const document0: LeviosaCanvasDocument = {
  schema_version: "leviosa-canvas-detail-page-v1",
  renderer: "leviosa_canvas_detail_page",
  kind: "detail-page",
  canvas: { width: W, background: "#ffffff" },
  canvas_json: {
    width: W,
    height: 1000,
    pages: [
      {
        id: "p1",
        width: W,
        height: 1000,
        background: "#f7f4ee",
        children: [
          { id: "bg", type: "figure", subType: "rect", x: 0, y: 0, width: W, height: 1000, fill: "#f7f4ee", locked: true, name: "배경" },
          { id: "title", type: "text", x: 80, y: 80, width: 700, height: 70, text: "오늘만 30% 할인", fontFamily: "Arial", fontSize: 56, fontWeight: "700", fill: "#111111", align: "left", name: "제목" },
          { id: "sub", type: "text", x: 80, y: 170, width: 700, height: 40, text: "레비오사 상세페이지 편집기 데모 문서", fontFamily: "Arial", fontSize: 22, fill: "#555555", name: "부제" },
          { id: "img1", type: "image", x: 80, y: 260, width: 340, height: 255, src: swatch("#e4572e"), name: "상품 사진 1" },
          { id: "img2", type: "image", x: 440, y: 260, width: 340, height: 255, src: swatch("#17bebb"), name: "상품 사진 2" },
          { id: "badge", type: "figure", subType: "ellipse", x: 660, y: 40, width: 140, height: 140, fill: "#ffcc00", rotation: 15, name: "배지" },
          { id: "badgeText", type: "text", x: 680, y: 95, width: 100, height: 30, text: "SALE", fontFamily: "Arial", fontSize: 26, fontWeight: "700", fill: "#111111", align: "center", rotation: 15, name: "배지 글자" },
          {
            id: "grp", type: "group", x: 80, y: 560, name: "특징 묶음",
            children: [
              { id: "g-rect", type: "figure", subType: "rect", x: 0, y: 0, width: 700, height: 160, fill: "#ffffff", cornerRadius: 16, name: "카드" },
              { id: "g-t1", type: "text", x: 24, y: 24, width: 300, height: 30, text: "✔ 무료 배송", fontFamily: "Arial", fontSize: 22, fill: "#222222" },
              { id: "g-t2", type: "text", x: 24, y: 64, width: 300, height: 30, text: "✔ 7일 무료 반품", fontFamily: "Arial", fontSize: 22, fill: "#222222" },
              { id: "g-t3", type: "text", x: 24, y: 104, width: 300, height: 30, text: "✔ 1년 A/S", fontFamily: "Arial", fontSize: 22, fill: "#222222" },
            ],
          },
          { id: "foot", type: "text", x: 80, y: 900, width: 700, height: 30, text: "© 2026 Leviosa AI", fontFamily: "Arial", fontSize: 16, fill: "#999999", name: "푸터" },
        ],
      },
      {
        id: "p2",
        width: W,
        height: 600,
        background: "#ffffff",
        children: [
          { id: "p2-title", type: "text", x: 80, y: 60, width: 700, height: 60, text: "두 번째 섹션", fontFamily: "Arial", fontSize: 44, fontWeight: "700", fill: "#111111" },
          { id: "p2-img", type: "image", x: 80, y: 160, width: 700, height: 380, src: swatch("#5c4b8a", 700, 380), name: "큰 사진" },
        ],
      },
    ],
  },
  fonts: [],
  source: "leviosa_canvas_editor",
  revision: 1,
};

// ── 앱 ───────────────────────────────────────────────────────
function Toasts() {
  const [, tick] = useState(0);
  useEffect(() => {
    renderToasts = () => tick((n) => n + 1);
    return () => {
      renderToasts = null;
    };
  }, []);
  if (!toasts.length) return null;
  return (
    <ol
      data-lab-toasts
      style={{ position: "fixed", right: 12, bottom: 12, zIndex: 9999, margin: 0, padding: 8, background: "#111", color: "#fff", fontSize: 12, borderRadius: 8, maxWidth: 360 }}
    >
      {toasts.slice(-5).map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ol>
  );
}

const queryClient = new QueryClient();
let saves = 0;

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DetailPageHostProvider host={host}>
        <DetailPageEditor
          initialDocument={document0}
          autoSaveDelayMs={1500}
          uploadFile={async (file) => URL.createObjectURL(file)}
          onSave={async (doc, meta) => {
            saves += 1;
            console.log("[save]", saves, meta, JSON.stringify(doc.canvas_json).length, "bytes");
            (window as unknown as { __lastSave: unknown }).__lastSave = { doc, meta, saves };
            await new Promise((r) => setTimeout(r, 300));
            return { revision: saves + 1 };
          }}
        />
        <Toasts />
      </DetailPageHostProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
