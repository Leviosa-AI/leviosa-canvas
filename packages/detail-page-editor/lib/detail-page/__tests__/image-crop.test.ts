import { describe, expect, it } from "vitest";

import {
  CROP_PRESETS,
  applyAspect,
  cropPatch,
  cropStart,
  dragCrop,
  fitRect,
  rectZoom,
  resolveAspect,
  zoomRect,
  type Rect,
} from "../image-crop";

/**
 * 자르기의 계약은 하나다. **문서에 남는 값으로 다시 그렸을 때 사용자가 고른 자리가
 * 그대로 나와야 한다.** 렌더러(`image-frame`)는 crop을 상자 비율에 맞춰 다시 맞추므로,
 * 상자와 자른 자리의 비율이 어긋나면 조용히 한 조각이 더 깎인다 — 그래서 여기서는
 * "무엇을 적었는가"가 아니라 **"적은 것을 렌더러가 어떻게 읽는가"**를 잰다.
 */

const natural = { width: 1000, height: 500 };

/** 렌더러가 이 요소를 어떻게 오려 그릴지 — cropStart가 부르는 것과 같은 길. */
function visible(el: Record<string, unknown>, box: { width: number; height: number }) {
  return cropStart(el, natural, box, false);
}

describe("cropStart", () => {
  it("자르기 값이 없는 배경 사진은 지금 보이는 자리(가운데 채워 자르기)에서 시작한다", () => {
    // 1000×500 원본을 400×400 상자에 채우면 좌우가 잘린다 → 가운데 500×500.
    const start = visible({ x: 0, y: 0, width: 400, height: 400 }, { width: 400, height: 400 });
    // 원본 전체는 상자보다 넓게 놓인다(가로가 잘려 나간 만큼).
    expect(start.image.width).toBeCloseTo(800, 5);
    expect(start.image.height).toBeCloseTo(400, 5);
    expect(start.image.x).toBeCloseTo(-200, 5);
    // 처음 자르기 상자는 지금 그려지는 자리 그대로다.
    expect(start.view).toEqual({ x: 0, y: 0, width: 400, height: 400 });
  });

  it("문서가 이미 자른 사진은 그 자리를 그대로 이어받는다", () => {
    const el = {
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      cropX: 0.5,
      cropY: 0,
      cropWidth: 0.2,
      cropHeight: 0.4,
    };
    const start = visible(el, { width: 200, height: 200 });
    // 원본에서 200×200을 오려 200×200에 그리므로 배율은 1 — 전체는 1000×500.
    expect(start.image.width).toBeCloseTo(1000, 5);
    expect(start.image.x).toBeCloseTo(-500, 5);
    expect(start.image.y).toBeCloseTo(0, 5);
  });

  it("누끼는 통째로 들어가므로 원본이 상자 안에 담긴다", () => {
    const start = cropStart(
      { x: 0, y: 0, width: 400, height: 400 },
      natural,
      { width: 400, height: 400 },
      true,
    );
    expect(start.image).toEqual({ x: 0, y: 100, width: 400, height: 200 });
    expect(start.view).toEqual({ x: 0, y: 100, width: 400, height: 200 });
  });
});

describe("dragCrop", () => {
  const bounds: Rect = { x: 0, y: 0, width: 400, height: 200 };
  const rect: Rect = { x: 100, y: 50, width: 200, height: 100 };

  it("옮기기는 크기를 지키고 원본 밖으로 안 나간다", () => {
    expect(dragCrop(rect, "move", 50, 20, bounds)).toEqual({
      x: 150,
      y: 70,
      width: 200,
      height: 100,
    });
    // 오른쪽 끝까지 밀어도 원본 안에 선다.
    expect(dragCrop(rect, "move", 9999, 9999, bounds)).toEqual({
      x: 200,
      y: 100,
      width: 200,
      height: 100,
    });
  });

  it("모서리를 끌면 반대편이 붙잡혀 있다", () => {
    const next = dragCrop(rect, "nw", 20, 10, bounds);
    expect(next).toEqual({ x: 120, y: 60, width: 180, height: 90 });
    // 오른쪽 아래 모서리는 그대로.
    expect(next.x + next.width).toBe(rect.x + rect.width);
    expect(next.y + next.height).toBe(rect.y + rect.height);
  });

  it("원본 밖으로는 못 넓힌다", () => {
    const next = dragCrop(rect, "se", 9999, 9999, bounds);
    expect(next.x + next.width).toBe(400);
    expect(next.y + next.height).toBe(200);
  });

  it("비율이 걸려 있으면 나머지 축이 따라온다", () => {
    const next = dragCrop(rect, "se", 60, 0, bounds, { aspect: 1 });
    expect(next.width).toBeCloseTo(next.height, 5);
    // 끈 축(폭)이 주인이다.
    expect(next.width).toBeCloseTo(150, 5);
    expect(next.x).toBe(rect.x);
    expect(next.y).toBe(rect.y);
  });
});

describe("비율과 확대", () => {
  const bounds: Rect = { x: 0, y: 0, width: 400, height: 200 };

  it("fitRect는 원본 안에 들어가는 가장 큰 사각형을 가운데 둔다", () => {
    expect(fitRect(bounds, 1)).toEqual({ x: 100, y: 0, width: 200, height: 200 });
    expect(fitRect(bounds, null)).toEqual(bounds);
  });

  it("비율을 바꿔도 가운데는 지킨다", () => {
    const rect: Rect = { x: 100, y: 50, width: 200, height: 100 };
    const next = applyAspect(rect, bounds, 1);
    expect(next.width).toBeCloseTo(next.height, 5);
    expect(next.x + next.width / 2).toBeCloseTo(200, 5);
    expect(next.y + next.height / 2).toBeCloseTo(100, 5);
  });

  it("확대 1배는 원본을 다 쓰고, 2배는 절반으로 좁아진다", () => {
    const one = zoomRect(bounds, bounds, null, 1);
    expect(one).toEqual(bounds);
    const two = zoomRect(bounds, bounds, null, 2);
    expect(two.width).toBeCloseTo(200, 5);
    expect(two.height).toBeCloseTo(100, 5);
    // 슬라이더 손잡이는 지금 상자에서 되읽는다.
    expect(rectZoom(two, bounds, null)).toBeCloseTo(2, 5);
  });

  it("원본 비율 프리셋은 사진에서 값을 뽑는다", () => {
    const original = CROP_PRESETS.find((preset) => preset.id === "original")!;
    expect(resolveAspect(original, natural)).toBeCloseTo(2, 5);
    const square = CROP_PRESETS.find((preset) => preset.id === "square")!;
    expect(resolveAspect(square, natural)).toBe(1);
  });
});

describe("cropPatch", () => {
  it("상자를 자른 자리로 옮기고 오려 올 자리를 비율로 적는다", () => {
    const el = { x: 40, y: 20, width: 400, height: 400 };
    const start = visible(el, { width: 400, height: 400 });
    // 원본 전체는 x:-200..600 에 놓여 있다. 왼쪽 절반을 고른다.
    const rect: Rect = { x: -200, y: 0, width: 400, height: 200 };
    const patch = cropPatch(el, start, rect);

    expect(patch).toMatchObject({ x: -160, y: 20, width: 400, height: 200 });
    expect(patch.cropX).toBeCloseTo(0, 5);
    expect(patch.cropY).toBeCloseTo(0, 5);
    expect(patch.cropWidth).toBeCloseTo(0.5, 5);
    expect(patch.cropHeight).toBeCloseTo(0.5, 5);
    expect(patch.stretchEnabled).toBe(false);
  });

  it("적은 값을 렌더러가 그대로 읽는다 — 다시 열어도 같은 자리다", () => {
    const el = { x: 0, y: 0, width: 400, height: 400 };
    const start = visible(el, { width: 400, height: 400 });
    const rect: Rect = { x: -100, y: 40, width: 300, height: 120 };
    const patch = cropPatch(el, start, rect);

    // 고친 요소를 다시 열면 자르기 상자가 상자 전체와 같아야 한다(더 깎이지 않았다).
    const reopened = visible(
      { ...el, ...patch },
      { width: patch.width as number, height: patch.height as number },
    );
    expect(reopened.view.x).toBeCloseTo(0, 5);
    expect(reopened.view.y).toBeCloseTo(0, 5);
    expect(reopened.view.width).toBeCloseTo(patch.width as number, 5);
    expect(reopened.view.height).toBeCloseTo(patch.height as number, 5);
  });

  it("회전한 요소는 그 각도로 옮긴다", () => {
    const el = { x: 100, y: 100, width: 200, height: 200, rotation: 90 };
    const start = visible(el, { width: 200, height: 200 });
    const patch = cropPatch(el, start, { x: 10, y: 0, width: 100, height: 100 });
    // 90°면 요소 좌표의 +x 는 화면 좌표의 +y 다.
    expect(patch.x).toBe(100);
    expect(patch.y).toBe(110);
  });

  it("동그랗게 자르기는 모서리를 반지름 끝까지 굴린다", () => {
    const el = { x: 0, y: 0, width: 400, height: 400 };
    const start = visible(el, { width: 400, height: 400 });
    const patch = cropPatch(
      el,
      start,
      { x: 0, y: 0, width: 200, height: 200 },
      { circle: true },
    );
    expect(patch.cornerRadius).toBe(100);
  });
});
