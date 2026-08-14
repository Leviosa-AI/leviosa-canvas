/**
 * 레퍼런스를 보낼 크기로 정하는 판정.
 *
 * 이 파일이 지키는 주장은 하나다 — **세로로 긴 캡쳐의 폭을 뭉개지 않는다.** 상세페이지
 * 전체 캡쳐(900×39418)에 긴 변 상한을 걸면 23×1024 가 나오고, 그 띠에는 섹션 경계도
 * 글자도 없다. 에러도 경고도 없이 통과하기 때문에 산출물을 눈으로 볼 때까지 안 드러나고,
 * 실제로 브랜드 저작이 "레퍼런스를 안 닮는" 사고의 원인이었다(2026-08-14).
 */

import { describe, expect, it } from "vitest";

import {
  MAX_CANVAS_PIXELS,
  REFERENCE_MAX_EDGE,
  TALL_MAX_WIDTH,
  TALL_MIN_WIDTH,
  TALL_TRIGGER_RATIO,
  planReferenceResize,
} from "../reference-image";

describe("planReferenceResize", () => {
  it("상세페이지 전체 캡쳐는 폭을 살려 그대로 보낸다", () => {
    // 실측 사고 재현: 긴 변 1024 를 걸면 23×1024 였다.
    const plan = planReferenceResize(900, 39418);
    expect(plan.tall).toBe(true);
    expect(plan.passThrough).toBe(true);
    expect(plan.width).toBe(900);
    expect(plan.height).toBe(39418);
  });

  it("세로로 긴 캡쳐는 긴 변이 아니라 폭으로만 줄인다", () => {
    const plan = planReferenceResize(2048, 20480);
    expect(plan.tall).toBe(true);
    expect(plan.width).toBe(TALL_MAX_WIDTH);
    expect(plan.height).toBe(10240);
  });

  it("캔버스 넓이 상한 안으로 눌러 담되 폭 하한은 지킨다", () => {
    // iOS Safari 는 넓은 캔버스에 예외 없이 빈 그림을 그린다. 폭 상한만 걸면 넘으므로
    // 넓이로 한 번 더 누른다 — 그래도 읽을 수 있는 폭이면 줄이는 쪽이 맞다.
    const plan = planReferenceResize(4000, 120000);
    expect(plan.tall).toBe(true);
    expect(plan.passThrough).toBe(false);
    expect(plan.width).toBeGreaterThanOrEqual(TALL_MIN_WIDTH);
    expect(plan.width).toBeLessThanOrEqual(TALL_MAX_WIDTH);
    expect(plan.width * plan.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
  });

  it("줄여도 캔버스 상한 안에 들면 줄인다", () => {
    const plan = planReferenceResize(1600, 8000);
    expect(plan.passThrough).toBe(false);
    expect(plan.width).toBe(TALL_MAX_WIDTH);
    expect(plan.width * plan.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
  });

  it("줄이면 읽을 수 없어지는 폭이면 원본을 보낸다", () => {
    // 폭 하한 아래로 내려간 그림은 밴드로 나눠도 글자가 안 남는다.
    const plan = planReferenceResize(700, 60000);
    expect(plan.passThrough).toBe(true);
    expect(plan.width).toBeGreaterThanOrEqual(TALL_MIN_WIDTH);
  });

  it("문턱 바로 아래는 예전대로 긴 변으로 줄인다", () => {
    const height = Math.floor(1000 * TALL_TRIGGER_RATIO) - 1;
    const plan = planReferenceResize(1000, height);
    expect(plan.tall).toBe(false);
    expect(Math.max(plan.width, plan.height)).toBe(REFERENCE_MAX_EDGE);
  });

  it("작은 그림은 키우지 않는다", () => {
    const plan = planReferenceResize(400, 300);
    expect(plan.passThrough).toBe(true);
    expect(plan).toMatchObject({ width: 400, height: 300 });
  });

  it("크기를 모르면 손대지 않는다", () => {
    expect(planReferenceResize(0, 0)).toMatchObject({ passThrough: true });
  });
});
