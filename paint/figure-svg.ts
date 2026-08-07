/**
 * 네이티브 도형(`figure`) → SVG 마크업.
 *
 * 도형은 캔버스에 직접 그려지므로 평소엔 마크업이 없다. 그런데 도형을 GIF로 굽거나
 * 파일로 내보낼 때는 **픽셀을 만들 수 있는 무언가**가 필요하다. 여기서 그리는 규칙은
 * `render/element-view.tsx`의 `FigureBody`와 같아야 한다 — 화면과 다른 그림이 나가면
 * 그게 곧 결함이다.
 *
 * `fill`은 **받은 문자열 그대로** 박는다. 그라데이션(`linear-gradient(...)`)은 SVG의
 * 유효한 paint가 아니라 부르는 쪽이 `<defs>`로 바꿔 끼우는데, 그 치환이 원문을 찾아
 * 바꾸는 방식이라 여기서 손대면 못 찾는다.
 */

import { asRecord, num, str, type Attrs } from "../types";

export type FigureLike = Attrs & {
  subType?: unknown;
  width?: unknown;
  height?: unknown;
  fill?: unknown;
  stroke?: unknown;
  strokeWidth?: unknown;
  dash?: unknown;
  cornerRadius?: unknown;
};

function attr(name: string, value: string | number | undefined): string {
  return value === undefined || value === "" ? "" : ` ${name}="${value}"`;
}

/**
 * 도형 하나를 통짜 `<svg>` 문자열로. 폭·높이가 0 이하면 `null`.
 *
 * 테두리는 선 가운데를 따라 그려지므로(캔버스와 같은 규약) 굵은 테두리는 상자 밖으로
 * 절반이 나간다. 그 절반이 잘리지 않도록 `viewBox`를 그만큼 넓힌다.
 */
export function figureToSvg(el: FigureLike): string | null {
  const width = num(el, "width", 0);
  const height = num(el, "height", 0);
  if (width <= 0 || height <= 0) return null;

  const subType = str(el, "subType", "rect");
  const fill = str(el, "fill");
  const stroke = str(el, "stroke");
  const strokeWidth = stroke ? num(el, "strokeWidth", 0) : 0;
  const dash = Array.isArray(el.dash)
    ? (el.dash as unknown[]).filter((one) => typeof one === "number").join(" ")
    : "";

  const paint =
    attr("fill", fill || "none") +
    attr("stroke", stroke || undefined) +
    attr("stroke-width", strokeWidth || undefined) +
    attr("stroke-dasharray", dash || undefined);

  const pad = strokeWidth / 2;
  const body =
    subType === "ellipse" || subType === "circle"
      ? `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}"${paint}/>`
      : `<rect x="0" y="0" width="${width}" height="${height}"` +
        // 둥글기는 화면과 같은 자리에서 읽는다(`render/attrs.ts`의 `cornerRadius`) —
        // 디컴포저가 `custom` 아래에 넣어 둔 값도 같이 본다.
        attr(
          "rx",
          num(el, "cornerRadius", num(asRecord(el.custom), "cornerRadius", 0)) ||
            undefined,
        ) +
        `${paint}/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="${-pad} ${-pad} ${width + strokeWidth} ${height + strokeWidth}">${body}</svg>`
  );
}
