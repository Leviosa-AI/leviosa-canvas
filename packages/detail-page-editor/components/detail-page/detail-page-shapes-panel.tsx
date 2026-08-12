"use client";

import { DetailPageBasicShapes } from "./detail-page-basic-shapes";

/**
 * "도형" 패널 — 기본 도형 카탈로그 하나만 있다.
 *
 * 예전에는 여기 아래에 공용 도형 라이브러리가 같이 붙어 있었다. 그 라이브러리는 성격이
 * 셋으로 갈린다(아이콘 · 배지 · 선 장식). 아이콘은 이제 "아이콘" 그룹이 2만 개를 검색으로
 * 덮으므로 여기 36개가 남아 있을 이유가 없고, 배지·선 장식은 **도형이 아니다** —
 * 도형은 자리를 만드는 것이고 장식은 완성된 그림이다. 그래서 "장식" 그룹으로 나갔다.
 */

export function DetailPageShapesPanel({ store }: { store: unknown }) {
  return <DetailPageBasicShapes store={store} />;
}
