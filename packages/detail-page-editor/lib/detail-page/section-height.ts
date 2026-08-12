/**
 * 섹션(편집기 한 장) 높이 — 재는 법, 바꾸는 법.
 *
 * 상세페이지의 한 장은 상품 카드가 아니라 **세로로 이어 붙는 띠**다. 그래서 높이가 고정된
 * 캔버스와 달리 장마다 다르고, 바꿀 수 있어야 한다("여기 좀 답답해요", "이 장이 너무 길어요").
 * Canvas 는 페이지 높이를 모델에 들고 있으므로(``page.set({height})``) 바꾸는 것 자체는
 * 한 줄이다. 여기 있는 것은 그 한 줄로는 안 되는 두 가지다.
 *
 * ## 1. 배경은 같이 늘어나야 한다
 *
 * 디컴포즈된 화면은 배경을 **요소로** 깐다 — 페이지를 꽉 채우는 사진, 그라데이션 사각형,
 * 색 띠. 페이지만 늘리면 그 요소는 옛 높이 그대로 남아 아래에 흰 띠가 생긴다. 유저가 보기에
 * 이건 기능이 아니라 고장이다. 그래서 **페이지를 꽉 채우고 있던** 요소는 늘어난 만큼 같이
 * 늘린다. 판정은 Canvas 자신이 ``setSize({useMagic})`` 에서 쓰는 것과 같은 모양이다
 * (원점에 붙어 있고 페이지만 한 크기).
 *
 * ## 2. 굽기 상한이 진짜 상한이다
 *
 * 편집기 문서를 HTML 로 굽는 서버(``editor_document_service``)는 페이지 높이를 120~8000px
 * 로 자른다. 편집기에서 9000px 을 잡을 수 있게 두면 화면에서는 멀쩡한데 구운 결과만 조용히
 * 잘린다 — 그건 편집기에서 막는 게 맞다.
 */

export type SectionHeightElement = {
  type?: string;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  children?: SectionHeightElement[];
  set?: (attrs: Record<string, unknown>) => void;
};

export type SectionHeightPage = {
  computedWidth?: number;
  computedHeight?: number;
  children?: SectionHeightElement[];
  set?: (attrs: Record<string, unknown>) => void;
};

/** 서버가 굽기에서 자르는 하한. 이보다 낮게 잡아도 구운 결과는 이 값이 된다. */
export const MIN_SECTION_HEIGHT = 200;

/**
 * 굽기 상한과 **같은 수**여야 한다(``editor_document_service._render_editor_document_html``).
 * 여기만 키우면 편집기에서는 되는데 구운 상세페이지만 잘린다.
 */
export const MAX_SECTION_HEIGHT = 8000;

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clampSectionHeight(value: unknown): number {
  const n = Math.round(num(value, MIN_SECTION_HEIGHT));
  return Math.max(MIN_SECTION_HEIGHT, Math.min(MAX_SECTION_HEIGHT, n));
}

/**
 * 이 요소가 **페이지 배경 노릇을 하고 있는가**.
 *
 * 원점에 붙어 있고(1px 오차 허용) 페이지를 거의 꽉 채우는 것. 텍스트와 그룹은 제외한다 —
 * 그룹은 자식이 좌표를 들고 있어 높이를 늘려도 화면이 달라지지 않고, 페이지만 한 텍스트
 * 상자를 배경으로 잘못 잡으면 글줄이 세로로 늘어난다.
 */
export function isSectionBackdrop(
  el: SectionHeightElement,
  pageWidth: number,
  pageHeight: number,
): boolean {
  const type = String(el?.type ?? "");
  if (type === "text" || type === "group") return false;
  return (
    num(el?.x) <= 1 &&
    num(el?.y) <= 1 &&
    num(el?.width) >= pageWidth - 2 &&
    num(el?.height) >= pageHeight - 2
  );
}

/**
 * 내용이 실제로 끝나는 y(px). "내용에 맞추기"가 이 값을 쓴다.
 *
 * 배경 요소는 세지 않는다 — 배경은 페이지를 따라다니는 것이라, 세면 "지금 높이"가 그대로
 * 답이 되어 버튼이 아무 일도 안 하게 된다. 그룹 자식은 페이지 절대 좌표를 들고 있고
 * (디컴포저가 그룹을 원점에 고정한다), 유저가 그룹을 끌면 그 이동량이 그룹 x/y 에 쌓이므로
 * 둘을 더해야 진짜 자리가 나온다.
 */
export function sectionContentBottom(page: SectionHeightPage): number {
  const pageWidth = num(page?.computedWidth);
  const pageHeight = num(page?.computedHeight);
  let bottom = 0;
  const visit = (el: SectionHeightElement, offsetY: number) => {
    const kids = el?.children;
    if (kids?.length) {
      const groupOffset = offsetY + num(el?.y);
      for (const kid of kids) visit(kid, groupOffset);
      return;
    }
    bottom = Math.max(bottom, offsetY + num(el?.y) + num(el?.height));
  };
  for (const el of page?.children ?? []) {
    if (isSectionBackdrop(el, pageWidth, pageHeight)) continue;
    visit(el, 0);
  }
  return Math.ceil(bottom);
}

/**
 * 높이를 바꾼다(배경까지 같이). 실제로 적용된 높이를 돌려준다.
 *
 * 늘어난 양을 **먼저** 재고 나서 페이지를 바꾼다 — 순서를 바꾸면 배경 판정이 이미 새 높이를
 * 보게 되어 아무것도 배경으로 안 잡힌다.
 */
export function applySectionHeight(
  page: SectionHeightPage,
  nextHeight: number,
): number {
  const next = clampSectionHeight(nextHeight);
  const prev = Math.round(num(page?.computedHeight));
  if (prev > 0 && next !== prev) {
    const pageWidth = num(page?.computedWidth);
    for (const el of page?.children ?? []) {
      if (!isSectionBackdrop(el, pageWidth, prev)) continue;
      el.set?.({ height: Math.max(1, num(el.height) + (next - prev)) });
    }
  }
  page?.set?.({ height: next });
  return next;
}
