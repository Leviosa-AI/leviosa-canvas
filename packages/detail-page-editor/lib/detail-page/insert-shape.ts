import { encodeSvgDataUri } from "../detail-page-canvas/export/svg";

/**
 * 공용/개인 도형(SVG 마크업)을 현재 페이지 중앙에 ``svg`` 요소로 삽입한다.
 *
 * Canvas svg 요소는 마크업을 ``src``에 data URI로 담는다(편집기의 인라인 렌더가
 * el.src를 디코드한다). viewBox 종횡비를 유지하고, 아이콘이 과하게 커지지 않게
 * 페이지 폭 대비 적당한 크기로 배치한다.
 */

type AddElementOpts = Record<string, unknown>;
type PageLike = {
  computedWidth: number;
  computedHeight: number;
  addElement: (opts: AddElementOpts) => unknown;
};
type StoreLike = { activePage?: PageLike; pages: PageLike[] };

function aspectFromViewBox(viewBox: string): number {
  const parts = viewBox.trim().split(/\s+/).map(Number);
  if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
    return parts[2] / parts[3];
  }
  return 1;
}

export function insertShape(
  store: unknown,
  markup: string,
  viewBox = "0 0 24 24",
): unknown {
  const s = store as StoreLike;
  const page = s.activePage ?? s.pages[0];
  if (!page || !markup) return null;

  const aspect = aspectFromViewBox(viewBox);
  // 아이콘/장식이라 페이지 폭의 ~18%(상한 200px)로 얌전하게.
  const width = Math.round(Math.min(page.computedWidth * 0.18, 200));
  const height = Math.round(width / (aspect || 1));

  return page.addElement({
    type: "svg",
    src: encodeSvgDataUri(markup),
    x: Math.round((page.computedWidth - width) / 2),
    y: Math.round((page.computedHeight - height) / 2),
    width,
    height,
  });
}
