/**
 * 글자가 실제로 몇 줄로 접히고 그 덩어리가 상자 안에서 어디에 앉는가.
 *
 * 편집기(`<textarea>`)와 캔버스(Konva)가 **같은 자리**에 글자를 놓아야 캐럿이 맞다.
 * 줄 나눔은 Konva 자신에게 물어보고(`measureHighlightLines`가 오프스크린 Konva.Text로
 * 재 준다), 세로 정렬 오프셋은 그 결과로 계산한다.
 */

import { measureHighlightLines } from "@/lib/detail-page-polotno/text-highlight-bands";

import { num, str, type Attrs } from "../types";
import { isSingleLineBox, lineHeightRatio } from "./attrs";

export type TextLayout = {
  /** 접힌 줄 수(최소 1). */
  lines: number;
  /** 한 줄 높이(px). */
  lineHeight: number;
  /** 글자 덩어리 전체 높이. */
  blockHeight: number;
  /**
   * 상자 위쪽에서 글자 덩어리까지의 거리. `verticalAlign`이 middle/bottom이면 0이 아니다 —
   * 이 값을 안 쓰면 세로 가운데 정렬된 문구를 고칠 때 캐럿이 위로 튄다.
   */
  offsetY: number;
};

export function measureTextLayout(el: Attrs, text?: string): TextLayout {
  const fontSize = num(el, "fontSize", 14);
  const ratio = lineHeightRatio(el.lineHeight, fontSize);
  const lineHeight = fontSize * ratio;
  const boxWidth = num(el, "width", 0);
  const value = text ?? str(el, "text");

  // 한 줄 상자는 접지 않는다(렌더러와 같은 규칙) — 폭 0을 주면 wrap이 꺼진다.
  const wrapWidth = isSingleLineBox(el) ? 0 : boxWidth;
  const measured = measureHighlightLines({
    text: value,
    fontSize,
    fontFamily: str(el, "fontFamily", "Arial"),
    fontWeight: el.fontWeight,
    fontStyle: str(el, "fontStyle") || (el.custom as Attrs)?.fontStyle,
    boxWidth: wrapWidth,
    lineHeightRatio: ratio,
  });

  const lines = Math.max(1, measured.length);
  const blockHeight = lines * lineHeight;
  const boxHeight = num(el, "height", 0);
  const align = str(el, "verticalAlign", "top");
  const slack = Math.max(0, boxHeight - blockHeight);
  const offsetY =
    align === "middle" || align === "center"
      ? slack / 2
      : align === "bottom"
        ? slack
        : 0;

  return { lines, lineHeight, blockHeight, offsetY };
}
