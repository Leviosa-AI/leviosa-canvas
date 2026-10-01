// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
/**
 * 지금 브라우저가 한 캔버스에 그릴 수 있는 크기. 넘기면 예외 없이 **빈 그림**이 나온다.
 *
 * 병합 PNG/JPG 는 모든 페이지를 한 캔버스에 쌓으므로 이 한계를 넘으면 페이지별로
 * 내려야 한다. 한계는 브라우저마다 크게 다르다 — iOS 기준(1,670만 px)을 데스크톱에
 * 걸면 860×19,000 남짓한 상세페이지부터 전부 쪼개진다.
 *
 * - iOS·iPadOS(모든 브라우저가 WebKit): 넓이 16,777,216
 * - Firefox: 한 변 32,767, 넓이 268,435,456
 * - 그 외(Chrome·Edge·데스크톱 Safari): 한 변 65,535, 넓이 268,435,456
 *
 * 수치는 jhildenbiddle/canvas-size 의 실측표를 따른다.
 */
export interface CanvasLimits {
  /** 한 변의 최대 픽셀. */
  side: number;
  /** 넓이(가로×세로)의 최대 픽셀. */
  area: number;
}

export function canvasLimits(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
  maxTouchPoints = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints,
): CanvasLimits {
  // iPadOS 는 데스크톱 Safari 로 자신을 소개한다 — 터치 지점으로 가린다.
  const ios =
    /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (ios) return { side: 16_777_216, area: 16_777_216 };
  if (/Firefox\//.test(userAgent)) return { side: 32_767, area: 268_435_456 };
  return { side: 65_535, area: 268_435_456 };
}

/** 이 크기의 캔버스를 그릴 수 없으면 넘긴 한계(px)를, 그릴 수 있으면 null 을 준다. */
export function exceededCanvasLimit(
  width: number,
  height: number,
  limits: CanvasLimits = canvasLimits(),
): number | null {
  if (Math.max(width, height) > limits.side) return limits.side;
  if (width * height > limits.area) return limits.area;
  return null;
}
