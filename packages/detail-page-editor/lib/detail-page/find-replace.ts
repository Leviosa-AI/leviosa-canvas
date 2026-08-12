/**
 * 문서 전체 텍스트 찾기·바꾸기.
 *
 * 상세페이지는 20섹션짜리다. 브랜드명·용량 표기(``30ml``)·성분 학명이 그 안에 흩어져
 * 있고, "30ml → 50ml"를 손으로 찾아 고치는 건 빠뜨리는 작업이다.
 */

export type SearchElement = {
  id: string;
  type?: string;
  text?: string;
  custom?: Record<string, unknown> | null;
  children?: SearchElement[];
};

export type SearchPage = { id: string; children?: SearchElement[] };

export type SearchOptions = { caseSensitive?: boolean };

export type TextMatch = {
  pageId: string;
  elementId: string;
  /** 그 요소 안에 몇 번 나오는가. */
  count: number;
};

/**
 * 차트 그룹 안인가.
 *
 * 표 안 텍스트는 **바꾼다** — 캔버스에서 고친 칸 글자는 다음 ``syncSpecGroup``에서
 * ``harvestTableEdits``가 스펙으로 걷어 올리므로 살아남는다.
 *
 * 차트 안 텍스트는 **건너뛴다** — 차트에는 harvest가 없어서 다음 동기화에 스펙이
 * 다시 그리며 되돌아간다. 조용히 되돌아가느니 아예 안 잡는 게 낫다. 그래서 세지도
 * 않는다(카운터가 바꿀 수 없는 것을 세면 거짓말이 된다).
 */
export function isChartGroup(el: SearchElement): boolean {
  return !!el.custom && "chart" in el.custom;
}

/** 겹치지 않게 센다 — "aaa"에서 "aa"는 두 번이 아니라 한 번이다(치환과 같은 셈법). */
export function countOccurrences(
  text: string,
  query: string,
  opts: SearchOptions = {},
): number {
  if (!query) return 0;
  const hay = opts.caseSensitive ? text : text.toLowerCase();
  const needle = opts.caseSensitive ? query : query.toLowerCase();
  // split은 겹치지 않는 조각으로 자른다 — 정규식을 안 쓰므로 사용자가 넣은 `.`·`(`가
  // 메타문자로 새지 않는다.
  return hay.split(needle).length - 1;
}

/**
 * 검색어가 든 텍스트 요소들. 그리는 순서(=페이지 순서, 그 안에서 자식 순서)를 지켜
 * ↑/↓로 훑는 순서가 문서를 읽는 순서와 같게 한다.
 */
export function collectTextMatches(
  pages: ReadonlyArray<SearchPage>,
  query: string,
  opts: SearchOptions = {},
): TextMatch[] {
  if (!query) return [];
  const out: TextMatch[] = [];
  const visit = (el: SearchElement, pageId: string) => {
    if (isChartGroup(el)) return;
    if (el.type === "text" && typeof el.text === "string") {
      const count = countOccurrences(el.text, query, opts);
      if (count > 0) out.push({ pageId, elementId: el.id, count });
    }
    for (const child of el.children ?? []) visit(child, pageId);
  };
  for (const page of pages) {
    for (const child of page.children ?? []) visit(child, page.id);
  }
  return out;
}

/** 전체 등장 횟수. 요소 수가 아니라 실제로 바뀔 자리 수다. */
export function totalOccurrences(matches: ReadonlyArray<TextMatch>): number {
  return matches.reduce((sum, m) => sum + m.count, 0);
}

/**
 * 문자열 그대로 치환. 정규식을 안 쓴다 — 검색어의 ``.``·``(``와 바꿀 말의 ``$&``가
 * 특수문자로 새면 사용자가 친 그대로가 안 들어간다.
 */
export function replaceInText(
  text: string,
  query: string,
  replacement: string,
  opts: SearchOptions = {},
): string {
  if (!query) return text;
  if (opts.caseSensitive) return text.split(query).join(replacement);

  // 대소문자를 무시할 땐 자리만 소문자로 찾고 잘라내기는 원문에서 한다.
  const hay = text.toLowerCase();
  const needle = query.toLowerCase();
  let out = "";
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) break;
    out += text.slice(from, at) + replacement;
    from = at + needle.length;
  }
  return out + text.slice(from);
}

/** ↑/↓로 감싸 돌기. 목록이 비면 null. */
export function stepIndex(
  current: number,
  length: number,
  direction: 1 | -1,
): number | null {
  if (length <= 0) return null;
  return (((current + direction) % length) + length) % length;
}
