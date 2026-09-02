import { frameOf } from "@leviosa-ai/canvas/render/frames";

type PageLike = { id: string; custom?: unknown };

/**
 * 지금 **보고 있는 프레임**의 페이지들.
 *
 * 후보 여러 벌을 한 문서에 담으면 페이지 목록과 아래 띠가 곧장 쓸모를 잃는다 — 열두
 * 줄짜리 목록에서 어느 줄이 어느 벌인지 알 수가 없다. 그 둘은 «지금 어디 있나»를
 * 말하는 물건이라, 보고 있는 한 벌만 담는 것이 맞다.
 *
 * 보고 있는 프레임은 **활성 페이지가 속한 프레임**이다. 따로 기억하지 않는다 —
 * 상태가 하나 더 생기면 캔버스와 목록이 서로 다른 답을 하는 날이 온다.
 *
 * 꼬리표가 하나도 없으면 문서 전체가 한 프레임이다. 지금까지 만들어진 문서에서
 * 이 함수는 아무것도 안 거른다.
 */
export function activeFramePages<T extends PageLike>(
  pages: readonly T[],
  activePageId?: string,
): T[] {
  if (!pages.some((page) => frameOf(page))) return [...pages];
  const active = pages.find((page) => page.id === activePageId) ?? pages[0];
  if (!active) return [];
  const frame = frameOf(active);
  return pages.filter((page) => frameOf(page) === frame);
}
