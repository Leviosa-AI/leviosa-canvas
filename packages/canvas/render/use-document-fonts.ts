"use client";

/**
 * 문서가 쓰는 폰트를 실제로 내려받고, 다 온 뒤에 한 번 다시 그리게 한다.
 *
 * Konva는 글자를 브라우저 폰트로 그리므로, 폰트가 늦게 오면 첫 프레임이 폴백 서체로
 * 굳는다(캔버스는 CSS처럼 저절로 다시 그리지 않는다). 그래서 로드 완료를 신호로 받아
 * 리렌더를 한 번 강제한다.
 */

import { useEffect, useState } from "react";

import type { CanvasStore } from "../store";
import { walkElements } from "../store";

export type FontRequest = { family: string; weight: string; sample: string };

/**
 * 폰트를 실제로 받아 오는 사람. **엔진은 어디서 받아오는지 모른다** (G7 경계 계약 4).
 *
 * 폰트 목록은 앱의 것이지 엔진의 것이 아니다 — 상세페이지는 우리 카탈로그를,
 * `leviosa-agency`는 자기 폰트를 꽂는다. 안 꽂으면 브라우저가 이미 아는 서체만
 * 그려진다(엔진이 죽지는 않는다).
 */
export type FontLoader = (request: FontRequest) => Promise<void>;

/** 문서 안에서 실제로 쓰이는 (서체, 굵기) 조합과 그 글자들. */
export function collectFontRequests(store: CanvasStore): FontRequest[] {
  const byKey = new Map<string, FontRequest>();
  walkElements(store, (el) => {
    if (el.type !== "text") return;
    const family = typeof el.fontFamily === "string" ? el.fontFamily : "";
    if (!family) return;
    const weight =
      typeof el.fontWeight === "number"
        ? String(el.fontWeight)
        : typeof el.fontWeight === "string"
          ? el.fontWeight
          : "400";
    const key = `${family}::${weight}`;
    const text = typeof el.text === "string" ? el.text : "";
    const found = byKey.get(key);
    if (found) found.sample += text;
    else byKey.set(key, { family, weight, sample: text });
  });
  return [...byKey.values()];
}

/** 폰트가 다 온 뒤 1이 되는 숫자. 캔버스가 이 값을 key/의존성으로 물면 다시 그린다. */
export function useDocumentFonts(
  store: CanvasStore,
  ready: boolean,
  loadFont?: FontLoader,
): number {
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    if (!ready || !loadFont) return;
    let cancelled = false;
    const requests = collectFontRequests(store);
    if (!requests.length) return;
    void Promise.all(
      requests.map((request) => loadFont(request).catch(() => undefined)),
    ).then(() => {
      if (!cancelled) setLoadedAt((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [store, ready, loadFont]);

  return loadedAt;
}
