// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
/**
 * 글자가 실제로 몇 줄로 접히고 그 덩어리가 상자 안에서 어디에 앉는가.
 *
 * 편집기(`<textarea>`)와 캔버스(Konva)가 **같은 자리**에 글자를 놓아야 캐럿이 맞다.
 * 줄 나눔은 오프스크린 Konva.Text에 물어보고, 세로 정렬 오프셋은 그 결과로 계산한다.
 */

import Konva from "konva";

import { num, str, type Attrs } from "../types";
import {
  isSingleLineBox,
  konvaFontStyle,
  lineHeightRatio,
} from "./attrs";

export type TextLayout = {
  /** 접힌 줄 수(최소 1). */
  lines: number;
  /** 한 줄 높이(px). */
  lineHeight: number;
  /** 글자 덩어리 전체 높이. */
  blockHeight: number;
  /** 가장 긴 줄의 실제 폭. */
  blockWidth: number;
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
  const node = new Konva.Text({
    text: value,
    fontSize,
    fontFamily: str(el, "fontFamily", "Arial"),
    fontStyle: konvaFontStyle(el),
    width: wrapWidth > 0 ? wrapWidth : undefined,
    wrap: wrapWidth > 0 ? "word" : "none",
    lineHeight: ratio,
    letterSpacing: num(el, "letterSpacing", 0) * fontSize,
  });
  const measured = (node.textArr ?? []) as Array<{ text: string; width: number }>;

  const lines = Math.max(1, measured.length);
  const blockHeight = lines * lineHeight;
  const blockWidth = Math.max(0, ...measured.map((line) => line.width));
  node.destroy();
  const boxHeight = num(el, "height", 0);
  const align = str(el, "verticalAlign", "top");
  const slack = Math.max(0, boxHeight - blockHeight);
  const offsetY =
    align === "middle" || align === "center"
      ? slack / 2
      : align === "bottom"
        ? slack
        : 0;

  return { lines, lineHeight, blockHeight, blockWidth, offsetY };
}

/**
 * 한 줄 상자에서 글자가 실제로 그려지기 시작하는 x(요소 로컬). 한 줄 글자는 상자 폭과
 * 상관없이 제 폭만큼만 그려지고, 정렬·패딩·자라난 폭(`textFitAnchorWidth`)만큼 밀린다.
 * element-view가 이 자리에 그린다 — 뒤집기처럼 «보이는 글자»를 기준 삼는 셈도 이걸 쓴다.
 */
export function singleLineTextX(el: Attrs, layout: TextLayout): number {
  const width = num(el, "width", 0);
  const align = str(el, "align", "left");
  const padding = el.backgroundEnabled === true ? num(el, "backgroundPadding", 0) : 0;
  const custom = (el.custom ?? {}) as Attrs;
  const anchorWidth = num(custom, "textFitAnchorWidth", width);
  const end = align === "right" || align === "end";
  const growX =
    align === "center" ? (anchorWidth - width) / 2 : end ? anchorWidth - width : 0;
  const textWidth = Math.max(1, width - padding * 2);
  return (
    growX +
    padding +
    (align === "center"
      ? (textWidth - layout.blockWidth) / 2
      : end
        ? textWidth - layout.blockWidth
        : 0)
  );
}
