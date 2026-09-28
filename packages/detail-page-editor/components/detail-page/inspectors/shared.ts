// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.

// 속성 패널과 그 인스펙터들이 함께 쓰는 모양·작은 도우미. detail-page-properties-panel.tsx 에서 그대로 옮겼다.

import { type FontCatalogStore } from "../../../lib/detail-page-canvas/font-catalog";

export type ParentLike = {
  /** "group" for a group parent; a page has no type. */
  type?: string;
  children?: ElementLike[];
  setElementZIndex?: (id: string, index: number) => void;
};
export type ElementLike = {
  id: string;
  type: string;
  set: (props: Record<string, unknown>) => void;
  /** mobx view: 부모(그룹 또는 페이지) 내에서의 인덱스. 0 = 맨 뒤. */
  zIndex?: number;
  /** mobx view: 직접 부모(그룹 또는 페이지). setElementZIndex로 재정렬. */
  parent?: ParentLike;
  [key: string]: unknown;
};
export type PageLike = {
  id: string;
  background?: string;
  clone?: () => void;
  width?: number;
  height?: number;
  computedWidth?: number;
  computedHeight?: number;
  set?: (props: Record<string, unknown>) => void;
  children?: ElementLike[];
};
export type StoreLike = {
  selectedElements?: ElementLike[];
  selectedElementsIds?: string[];
  getElementById?: (id: string) => ElementLike | undefined;
  activePage?: PageLike;
  pages: PageLike[];
  fonts?: FontCatalogStore["fonts"];
  addFont?: FontCatalogStore["addFont"];
  deleteElements?: (ids: string[]) => void;
  deletePages?: (ids: string[]) => void;
  ungroupElements?: (ids: string[]) => void;
};

export const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
export const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" ? v : fallback;

// 편집기 선택 이미지 src를 GIF 참조로 쓸 수 있게 정규화한다. 백엔드는 data:/http(s)를
// 받으므로: data URI는 그대로, 그 외(상대경로·blob·동일출처 프록시)는 fetch해서 data URI로
// 변환한다(원본 바이트라 alpha 보존). 교차출처 http(s)라 fetch가 CORS로 막히면 원본 URL을
// 그대로 넘겨 백엔드가 서버측에서 내려받게 한다. 못 구하면 null.
export async function resolveReferenceSrc(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("data:")) return src;
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    // 교차출처 등으로 클라 fetch 실패 → 백엔드가 직접 받을 수 있는 http(s)면 원본 URL.
    return /^https?:\/\//.test(src) ? src : null;
  }
}
