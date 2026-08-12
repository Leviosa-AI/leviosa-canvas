/**
 * 엑셀·구글시트에서 붙여넣은 텍스트를 격자로 쪼갠다.
 *
 * 클립보드의 ``text/plain``은 스프레드시트에서 탭 구분 텍스트로 온다. Canva·미리캔버스가
 * 하는 것도 이거고, 파일 업로드보다 압도적으로 자주 쓰인다. CSV(쉼표)·세미콜론도 같이
 * 받아 준다. 차트와 표가 같은 규칙으로 읽어야 사용자가 두 번 배우지 않는다.
 */

export function splitLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
}

/** 구분자 추론: 탭 > 쉼표 > 세미콜론 > 연속 공백. */
export function pickDelimiter(lines: string[]): RegExp {
  const joined = lines.join("\n");
  if (joined.includes("\t")) return /\t/;
  if (joined.includes(",")) return /,/;
  if (joined.includes(";")) return /;/;
  return /\s{2,}/;
}

export function cellsOf(line: string, delimiter: RegExp): string[] {
  return line.split(delimiter).map((cell) => cell.trim());
}

/** 붙여넣은 텍스트를 문자열 격자로. 읽을 게 없으면 빈 배열. */
export function parseGrid(text: string): string[][] {
  const lines = splitLines(text ?? "");
  if (lines.length === 0) return [];
  const delimiter = pickDelimiter(lines);
  return lines.map((line) => cellsOf(line, delimiter));
}
