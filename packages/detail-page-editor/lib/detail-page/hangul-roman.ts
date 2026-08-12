/**
 * 한글을 라틴 글자로 옮긴다. **외래어를 되짚기 위한** 것이지 표기법을 지키려는 것이 아니다.
 *
 * 아이콘 이름은 전부 영어다. "사과"처럼 순우리말은 사전(`icon-keywords.ko.ts`)이
 * 옮겨 주지만, "애플"·"카메라"처럼 **영어를 한글로 적은 말**은 사전에 다 담을 수 없다 —
 * 브랜드·제품 이름은 끝이 없기 때문이다. 그런 말은 소리로 되짚는 편이 낫다.
 *
 * "애플" → `aepeul` → (`icon-fuzzy`의 자리표) → `apl` ← `apple`.
 *
 * 국어의 로마자 표기법을 그대로 따르지는 않는다(음운 변동·붙임표를 안 본다). 뒤에서
 * 자리표가 모음을 뭉개고 비슷한 자음을 합치므로 여기서는 **글자 그대로** 옮기면 된다.
 */

const BASE = 0xac00;
const LAST = 0xd7a3;

const CHO = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s",
  "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
];

const JUNG = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa",
  "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];

const JONG = [
  "", "k", "k", "ks", "n", "nj", "nh", "t", "l", "lk",
  "lm", "lp", "ls", "lt", "lp", "lh", "m", "p", "ps", "t",
  "t", "ng", "t", "t", "k", "t", "p", "t",
];

/** 한글이 하나라도 있는가. */
export function hasHangul(text: string): boolean {
  return /[가-힣]/.test(text);
}

/**
 * 한글을 소리 나는 대로 라틴 글자로. 한글이 아닌 글자는 그대로 지나간다.
 *
 * 겹받침은 앞의 대표음만 남기는 대신 두 글자를 그대로 적는다(`ks`, `lm`) — 자리표가
 * 어차피 뭉갠다.
 */
export function romanizeHangul(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < BASE || code > LAST) {
      out += char;
      continue;
    }
    const index = code - BASE;
    out += CHO[Math.floor(index / 588)];
    out += JUNG[Math.floor((index % 588) / 28)];
    out += JONG[index % 28];
  }
  return out;
}
