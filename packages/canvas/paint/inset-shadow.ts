/**
 * 안쪽 그림자 — 캔버스에는 그런 게 «없다». 만들어 쓴다.
 *
 * CSS `box-shadow: … inset` 은 도형 «안쪽» 가장자리에서 번지는 그림자다.
 * 캔버스 2D 의 그림자는 언제나 그린 것의 «바깥»으로 번지므로, 뒤집어서 얻는다:
 *
 *   1. 도형 모양으로 «클립»을 건다 — 이제 도형 밖에는 아무것도 안 그려진다
 *   2. 「큰 사각형 − 도형」 이라는 «고리»를 그린다. 고리는 통째로 클립 밖이라 안 보인다
 *   3. 그런데 그 고리가 «지는 그림자»는 안쪽으로 번져 들어와 클립 안에 남는다
 *
 * 고리를 만들 때 even-odd 를 쓰므로 Konva 의 `fillStrokeShape` 를 못 쓴다
 * (fillRule 을 안 받는다). 그래서 원시 2D 문맥을 직접 만진다.
 *
 * 채우는 색은 «불투명»이어야 한다. 캔버스 그림자는 그린 것의 알파를 따라가므로,
 * 반투명하게 채우면 그림자까지 옅어져 원본보다 흐려진다. 색과 진하기는
 * `shadowColor` 가 들고 있다.
 */

export type InsetShadow = {
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
};

type Ctx2D = CanvasRenderingContext2D;

/** 그림자가 어디까지 번지는지 — 고리를 그만큼 넉넉히 잡아야 잘리지 않는다. */
function ringPadding(shadow: InsetShadow): number {
  return shadow.blur * 2 + Math.abs(shadow.offsetX) + Math.abs(shadow.offsetY) + 16;
}

function roundedSubPath(
  ctx: Ctx2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function ellipseSubPath(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  ctx.moveTo(cx + rx, cy);
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.closePath();
}

/** 모난 사각형·라운드 사각형에 안쪽 그림자 한 겹. */
export function drawInsetShadowRect(
  ctx: Ctx2D,
  width: number,
  height: number,
  radius: number,
  shadow: InsetShadow,
): void {
  if (width <= 0 || height <= 0) return;
  const pad = ringPadding(shadow);
  ctx.save();
  ctx.beginPath();
  roundedSubPath(ctx, 0, 0, width, height, radius);
  ctx.clip();

  ctx.beginPath();
  ctx.rect(-pad, -pad, width + pad * 2, height + pad * 2);
  roundedSubPath(ctx, 0, 0, width, height, radius);
  ctx.shadowColor = shadow.color;
  ctx.shadowBlur = shadow.blur;
  ctx.shadowOffsetX = shadow.offsetX;
  ctx.shadowOffsetY = shadow.offsetY;
  ctx.fillStyle = "#000000";
  ctx.fill("evenodd");
  ctx.restore();
}

/** 타원에 안쪽 그림자 한 겹. */
export function drawInsetShadowEllipse(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  shadow: InsetShadow,
): void {
  if (rx <= 0 || ry <= 0) return;
  const pad = ringPadding(shadow);
  ctx.save();
  ctx.beginPath();
  ellipseSubPath(ctx, cx, cy, rx, ry);
  ctx.clip();

  ctx.beginPath();
  ctx.rect(cx - rx - pad, cy - ry - pad, (rx + pad) * 2, (ry + pad) * 2);
  ellipseSubPath(ctx, cx, cy, rx, ry);
  ctx.shadowColor = shadow.color;
  ctx.shadowBlur = shadow.blur;
  ctx.shadowOffsetX = shadow.offsetX;
  ctx.shadowOffsetY = shadow.offsetY;
  ctx.fillStyle = "#000000";
  ctx.fill("evenodd");
  ctx.restore();
}
