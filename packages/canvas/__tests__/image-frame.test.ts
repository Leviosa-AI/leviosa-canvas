/**
 * 사진 앉히기. 늘여 그리면 같은 문서인데 사진만 눌린다 — 싱크로 하네스가 sulwhasoo
 * 표지에서 그걸 잡았다(우리 쪽만 확대돼 병이 잘렸다).
 */

import { describe, expect, it } from "vitest";

import { hasDocumentCrop, imageFrame } from "../render/image-frame";

/** 가로로 긴 원본(2:1). */
const natural = { width: 1000, height: 500 };

describe("imageFrame — 배경 사진(cover)", () => {
  it("상자가 더 좁으면 좌우를 가운데만 남기고 잘라 낸다", () => {
    const { dest, crop } = imageFrame({}, natural, { width: 100, height: 100 }, false);
    expect(dest).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    // 500×500을 가운데(250..750)에서 오려 온다 — 왼쪽 위가 아니다.
    expect(crop).toEqual({ x: 250, y: 0, width: 500, height: 500 });
  });

  it("상자가 더 넓적하면 위아래를 가운데만 남기고 잘라 낸다", () => {
    const { crop } = imageFrame({}, natural, { width: 400, height: 100 }, false);
    expect(crop).toEqual({ x: 0, y: 125, width: 1000, height: 250 });
  });

  it("비율이 같으면 통째로 쓴다", () => {
    const { crop } = imageFrame({}, natural, { width: 200, height: 100 }, false);
    expect(crop).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
  });
});

describe("imageFrame — 누끼(contain)", () => {
  it("통째로 넣고 상자 가운데에 둔다", () => {
    const { dest, crop } = imageFrame({}, natural, { width: 400, height: 400 }, true);
    // 1000×500을 400폭에 맞추면 400×200, 위아래 100씩 남는다.
    expect(dest).toEqual({ x: 0, y: 100, width: 400, height: 200 });
    expect(crop).toBe(undefined);
  });
});

describe("imageFrame — 문서가 말한 대로", () => {
  it("crop 값이 있으면 그 자리를 그대로 쓴다", () => {
    const { crop } = imageFrame(
      { cropX: 0.5, cropY: 0, cropWidth: 0.5, cropHeight: 1 },
      natural,
      { width: 300, height: 300 },
      false,
    );
    expect(crop).toEqual({ x: 500, y: 0, width: 500, height: 500 });
  });

  it("stretchEnabled면 상자에 그대로 늘인다", () => {
    const frame = imageFrame({ stretchEnabled: true }, natural, {
      width: 400,
      height: 100,
    }, false);
    expect(frame).toEqual({ dest: { x: 0, y: 0, width: 400, height: 100 } });
  });

  it("디컴포저가 비워 둔 null은 crop 선언이 아니다", () => {
    expect(hasDocumentCrop({ cropX: null, cropWidth: null })).toBe(false);
    expect(hasDocumentCrop({ cropWidth: 0.5 })).toBe(true);
  });

  it("크기를 모르면 상자에 그대로 그린다", () => {
    expect(
      imageFrame({}, { width: 0, height: 0 }, { width: 10, height: 10 }, true),
    ).toEqual({ dest: { x: 0, y: 0, width: 10, height: 10 } });
  });
});
