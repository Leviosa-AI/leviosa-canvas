/**
 * 재저작한 화면 하나를 문서에 갈아 끼운다.
 *
 * 서버는 그 화면만 다시 디컴포즈해 **페이지 하나**를 돌려준다. 문서를 통째로 다시
 * 받지 않는 이유는 단순하다: 16개 화면을 전부 브라우저에 다시 태우면 유저가 수십 초를
 * 기다린다. 슬롯 이름이 화면 단위로 스코프돼 있어(``<라벨>.<이름>``) 페이지 하나만
 * 바꿔도 다른 화면의 슬롯과 섞이지 않는다.
 *
 * **자리를 지킨다.** 지웠다 뒤에 붙이면 재저작한 화면이 문서 맨 끝으로 간다 — 유저는
 * 고쳐 달라고 했지 옮겨 달라고 하지 않았다.
 */

export type CanvasDocument = {
  pages?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

/**
 * ``page.id`` 가 같은 페이지를 새 페이지로 교체한 문서를 돌려준다(원본 불변).
 *
 * 같은 id 의 페이지가 없으면 문서를 그대로 돌려준다 — 새 화면을 조용히 덧붙이면
 * 유저 화면에는 고쳐진 것과 안 고쳐진 것이 나란히 남는다.
 */
export function replaceCanvasPage(
  document: CanvasDocument,
  page: Record<string, unknown>,
): CanvasDocument {
  const pages = document.pages ?? [];
  const id = String(page?.id ?? "");
  const index = pages.findIndex((entry) => String(entry?.id ?? "") === id);
  if (!id || index < 0) return document;
  const next = pages.slice();
  next[index] = page;
  return { ...document, pages: next };
}
