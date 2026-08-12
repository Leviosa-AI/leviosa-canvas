/**
 * 아이콘 검색 — 편집기 "요소 · 아이콘" 그룹이 쓰는 얇은 층.
 *
 * 검색은 우리 서버(`/api/icons`)를 거친다. 이유는 그 라우트 주석에 있다(라이선스 게이트 ·
 * 한국어 확장 · 마크업 배치).
 *
 * 사진과 달리 **S3로 옮겨 담지 않는다.** 아이콘은 삽입하는 순간 마크업이 문서 안에
 * 박히므로 저장된 상세페이지가 제공처 수명에 묶이지 않는다.
 */

import type { IconStyle } from "./icon-search";

export type { IconStyle };

/** 일반 아이콘과 브랜드 로고는 성격이 달라 그룹을 나눈다(로고는 상표다). */
export type IconGroup = "icons" | "logos";

export type IconItem = {
  /** `"tabler:truck"` — 제공처 식별자. 최근 목록의 키로도 쓴다. */
  id: string;
  style: IconStyle;
  /** 완성된 `<svg>` 마크업. 모노크롬 세트는 `currentColor`를 쓴다. */
  markup: string;
  viewBox: string;
  /** 사람이 읽는 세트 이름 — 격자에는 안 쓰고 툴팁·출처에만 쓴다. */
  setName: string;
  /** 통과한 SPDX. 화면에는 안 쓰지만 사고가 났을 때 추적할 수 있어야 한다. */
  license: string;
};

export type IconSearchResponse = {
  items: IconItem[];
  group: IconGroup;
  /** 0-based 쪽 번호. */
  page: number;
  /** 다음 쪽이 있다. 격자 바닥에 닿으면 이어 받는다. */
  hasMore: boolean;
  /** 전체 상한에서 잘렸다는 뜻. 패널이 "검색어를 좁혀 보라"고 안내한다. */
  truncated: boolean;
};

export type IconSearchQuery = {
  query: string;
  group?: IconGroup;
  style?: IconStyle;
  /** 0-based. 안 주면 첫 쪽. */
  page?: number;
  signal?: AbortSignal;
};

export async function searchIcons({
  query,
  group = "icons",
  style,
  page = 0,
  signal,
}: IconSearchQuery): Promise<IconSearchResponse> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (group !== "icons") params.set("group", group);
  if (style) params.set("style", style);
  if (page > 0) params.set("page", String(page));

  const response = await fetch(`/api/icons?${params.toString()}`, { signal });
  if (!response.ok) throw new Error(`icons ${response.status}`);
  return (await response.json()) as IconSearchResponse;
}
