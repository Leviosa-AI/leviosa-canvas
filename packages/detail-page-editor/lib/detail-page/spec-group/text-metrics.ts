/**
 * 폰트 없이 재는 글자 치수. 차트·표 레이아웃이 같은 자를 쓴다.
 *
 * 캔버스도 폰트도 없이 도는 순수 계산이라 서버·테스트·썸네일 어디서나 같은 값이 나온다.
 * 정확할 필요는 없고 **겹치지만 않으면** 된다.
 */

/** 텍스트 한 줄이 차지하는 높이 비율. 레이아웃 계산과 실제 렌더가 어긋나지 않게 한 곳에서만 잰다. */
export const LINE_HEIGHT = 1.3;

export function textHeight(fontSize: number): number {
  return Math.round(fontSize * LINE_HEIGHT);
}

/**
 * 글자 폭 어림값.
 *
 * 한글·한자·가나는 정사각에 가깝고 라틴/숫자는 그 절반쯤이다.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const char of text) {
    units += /[ᄀ-ᇿ㄰-㆏가-힯一-鿿぀-ヿ]/.test(char) ? 1 : 0.55;
  }
  return units * fontSize;
}

/**
 * 폭이 정해진 상자에서 글자가 차지할 줄 수.
 *
 * 폭 추정이라 실제 Konva 줄바꿈과 한두 글자 어긋날 수 있다. 적게 세면 글자가 칸 밖으로
 * 흘러 아래 행의 구분선과 겹치므로, 폭을 살짝 넉넉히 잡아 **많이 세는 쪽으로** 기운다.
 */
export function estimateLineCount(
  text: string,
  fontSize: number,
  boxWidth: number,
): number {
  if (!text) return 1;
  const usable = Math.max(1, boxWidth);
  const explicit = text.split("\n");
  let lines = 0;
  for (const segment of explicit) {
    const width = estimateTextWidth(segment, fontSize) * 1.04;
    lines += Math.max(1, Math.ceil(width / usable));
  }
  return Math.max(1, lines);
}
