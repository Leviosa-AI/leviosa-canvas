/**
 * "정확히 맞은 것 먼저, 비슷한 것은 그 아래."
 *
 * 아이콘 검색이 두 가지로 새고 있었다.
 *
 *  1. **오타 한 글자에 0건.** `aple`을 치면 제공처 검색이 아무것도 안 준다. 사람은
 *     자기가 틀린 줄 모르고 "그런 아이콘이 없다"고 읽는다.
 *  2. **외래어가 안 걸린다.** "애플"은 사전에 없으면 0건인데, 정작 `apple`로 치면 나온다.
 *     한글로 치는 사람만 손해를 본다.
 *
 * 그래서 이름을 **자리표(skeleton)**로 뭉갠 뒤 견준다. 모음과 겹글자를 걷어내고 같은
 * 소리를 내는 자음을 한 글자로 모으면, `apple`·`aple`·`애플`이 전부 `apl`로 만난다.
 *
 * 등급을 매기는 이유는 순서 때문이다. 비슷한 것을 정확한 것과 섞어 버리면 검색이
 * 나빠진다 — 아래로 내려보내야 "덤"이 된다.
 */

import { hasHangul, romanizeHangul } from "./hangul-roman";

/** 얼마나 잘 맞았나. 큰 것이 위로 간다. */
export const MATCH_EXACT = 3;
export const MATCH_PARTIAL = 2;
export const MATCH_FUZZY = 1;
export const MATCH_NONE = 0;

export type MatchTier =
  | typeof MATCH_EXACT
  | typeof MATCH_PARTIAL
  | typeof MATCH_FUZZY
  | typeof MATCH_NONE;

/**
 * 견줄 수 있는 한 가지 모양으로 뭉갠다.
 *
 * 규칙은 전부 "한글로 옮겨 적을 때 흔들리는 자리"다 — `c/k`, `ph/f`, `x/ks`, 겹자음,
 * 끝의 묵음 `e`. 모음은 남긴다(모음까지 지우면 `bell`과 `ball`이 같아진다).
 */
export function skeleton(text: string): string {
  let out = text.toLowerCase().replace(/[^a-z]/g, "");
  if (!out) return "";
  out = out
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/c/g, "k")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/z/g, "s")
    .replace(/(.)\1+/g, "$1");
  // 끝의 묵음 e — `apple`과 `appl`이 갈리면 안 된다.
  if (out.length > 2 && out.endsWith("e")) out = out.slice(0, -1);
  return out;
}

/**
 * 한글 낱말의 자리표. 로마자로 옮긴 뒤 **한국어가 끼워 넣는 모음을 뺀다.**
 *
 * "플"의 `eu`(ㅡ)와 "트"의 `eu`는 영어에 없던 소리다 — 그걸 빼야 `aepeul`이 `apl`이
 * 되어 `apple`과 만난다. `ae`(ㅐ)와 `eo`(ㅓ)도 영어의 `a`·`o` 자리라 되돌린다.
 */
export function koreanSkeleton(text: string): string {
  const roman = romanizeHangul(text);
  const folded = roman
    .toLowerCase()
    .replace(/eu/g, "")
    .replace(/ae/g, "a")
    .replace(/eo/g, "o")
    .replace(/oe/g, "o");
  return skeleton(folded);
}

/**
 * 한글 자리표에서 **영어 쪽으로 갈릴 수 있는 자리**를 되돌린 후보들.
 *
 * 자리표를 더 뭉개는 길도 있었지만 그쪽은 못 쓴다. `f`와 `p`를 합치면 `folder`와
 * `fold`가 같은 자리표가 되어 "폴더"가 `calendar-fold` 계열을 물어 온다(실측 415건).
 * 뭉개기는 **모든 이름에** 걸리기 때문이다.
 *
 * 그래서 반대로 간다. 이름은 건드리지 않고 **질의 쪽에서만** 후보를 펼친 뒤
 * *정확히* 같은 것을 찾는다. 흔들리는 자리는 넷뿐이다.
 *
 *  - ㅍ은 `p`이자 `f`다 — "필터" ↔ `filter`
 *  - ㄹ은 `r`이자 `l`이다 — "링크" ↔ `link`
 *  - 종성 ㅇ은 늘 `ng`인데 영어는 그 자리가 `n`인 것이 많다 — `ringk` ↔ `link`
 *  - 영어의 약모음 꼬리를 한국어는 ㅓ/ㅡ로 받는다 — "폴더" ↔ `folder`
 *
 * 정확히 같은 것만 세므로 후보를 늘려도 잡음이 거의 안 는다. `fold`처럼 진짜로 겹치는
 * 말만 남는데, 그것들은 어차피 맨 아래 등급이다.
 */
export function pronunciationVariants(base: string): string[] {
  if (base.length < 3) return [];

  let set = new Set([base]);
  const branch = (fold: (word: string) => string) => {
    const next = new Set(set);
    for (const word of set) {
      const folded = fold(word);
      if (folded !== word) next.add(folded);
    }
    set = next;
  };
  branch((word) => word.replace(/p/g, "f"));
  branch((word) => word.replace(/r/g, "l"));
  branch((word) => word.replace(/ng/g, "n"));

  const withTails = new Set(set);
  for (const word of set) {
    if (!/[ou]$/.test(word)) continue;
    for (const tail of ["er", "or", "ar", "e", "a", ""]) {
      withTails.add(word.slice(0, -1) + tail);
    }
  }
  return [...withTails].filter((word) => word.length >= 3);
}

/**
 * 질의 하나의 후보 집합. `matchTier`는 이름마다 불리므로(3.6만 번) 여기서 한 번만 편다.
 */
const variantMemo = new Map<string, ReadonlySet<string>>();

function variantsFor(term: string): ReadonlySet<string> {
  const hit = variantMemo.get(term);
  if (hit) return hit;
  const made = new Set(pronunciationVariants(koreanSkeleton(term)));
  // 질의는 몇 개 안 된다. 늘어나면 통째로 버린다.
  if (variantMemo.size > 200) variantMemo.clear();
  variantMemo.set(term, made);
  return made;
}

/** 두 낱말 사이의 편집 거리. `max`를 넘으면 그 자리에서 그만둔다(빨라야 한다). */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (!a.length || !b.length) return Math.max(a.length, b.length);

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      row.push(value);
      if (value < best) best = value;
    }
    // 이 줄에서 이미 전부 max를 넘었으면 더 볼 것이 없다.
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * 낱말 길이에 맞춘 오타 허용치. 짧은 말일수록 빡빡해야 한다.
 *
 * 네 글자까지 한 글자도 안 봐주는 것은 실측 때문이다. `kopi`(커피)에 한 글자를 허용하면
 * `copy`와 `cookie`가 딸려 오고, `star`에 한 글자를 허용하면 `start`가 붙은 정렬
 * 아이콘이 수백 개 들어온다. 짧은 말에서는 한 글자가 곧 다른 말이다.
 */
function tolerance(word: string): number {
  if (word.length <= 4) return 0;
  if (word.length <= 7) return 1;
  return 2;
}

/** 아이콘 이름을 견줄 조각들로. `arrow-right-fill` → `["arrow","right","fill"]`. */
function words(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * 이 이름이 이 낱말들에 얼마나 맞는가.
 *
 * 이름 전체가 그 말이면 최고점, 이름 안에 그 말이 조각으로 들어 있으면 그 다음,
 * 자리표가 오타 한두 개 거리면 마지막 등급이다.
 */
export function matchTier(
  name: string,
  terms: readonly string[],
  /**
   * 오타·소리로 되짚어도 되는 말들. 기본은 `terms` 전부다.
   *
   * 라우트는 여기에 **사용자가 실제로 친 말만** 넣는다. 사전이 옮겨 준 영어까지
   * 흐리게 견주면 얻는 것 없이 잃기만 한다 — "별점"의 `stars`가 `align-start`를
   * 물어 오는 식이다(실측 79건). 사전 낱말은 이미 정확한 영어다.
   */
  fuzzyTerms: readonly string[] = terms,
): MatchTier {
  const flat = name.toLowerCase();
  const parts = words(name);
  const joined = parts.join("");
  let best: MatchTier = MATCH_NONE;

  for (const raw of terms) {
    const term = raw.toLowerCase().trim();
    if (!term) continue;

    if (flat === term || joined === term.replace(/[^a-z0-9]/g, "")) return MATCH_EXACT;
    // `apple`로 쳤을 때 `apple-fill`·`apple-logo`도 정확히 맞은 것으로 친다.
    if (parts[0] === term) return MATCH_EXACT;

    // 조각이 **통째로** 그 말일 때만 친다. 글자만 들어 있으면 되게 두면
    // `star`가 `align-start`를 물어 온다(실측 207건).
    if (parts.includes(term)) {
      best = Math.max(best, MATCH_PARTIAL) as MatchTier;
      continue;
    }

    if (!fuzzyTerms.includes(raw)) continue;
    const korean = hasHangul(term);
    const key = korean ? koreanSkeleton(term) : skeleton(term);
    if (key.length < 3) continue;
    // 소리 후보는 한글에만 편다. 영어로 친 말은 이미 영어라 펼 것이 없다.
    const sounds = korean ? variantsFor(term) : null;
    const limit = tolerance(key);
    for (const part of [joined, ...parts]) {
      const other = skeleton(part);
      if (other.length < 3) continue;
      if (sounds?.has(other) || editDistance(key, other, limit) <= limit) {
        best = Math.max(best, MATCH_FUZZY) as MatchTier;
        break;
      }
    }
  }
  return best;
}

/**
 * 이름 목록을 등급별로 나눈다. 위 등급부터 내보내면 "정확한 것 먼저"가 된다.
 *
 * `ids`는 `"prefix:name"`이다 — 등급은 이름만 보고 매긴다.
 */
export function tierIds(
  ids: readonly string[],
  terms: readonly string[],
  fuzzyTerms: readonly string[] = terms,
): { exact: string[]; partial: string[]; fuzzy: string[] } {
  const exact: string[] = [];
  const partial: string[] = [];
  const fuzzy: string[] = [];
  for (const id of ids) {
    const colon = id.indexOf(":");
    const name = colon > 0 ? id.slice(colon + 1) : id;
    const tier = matchTier(name, terms, fuzzyTerms);
    if (tier === MATCH_EXACT) exact.push(id);
    else if (tier === MATCH_PARTIAL) partial.push(id);
    else if (tier === MATCH_FUZZY) fuzzy.push(id);
  }
  return { exact, partial, fuzzy };
}
