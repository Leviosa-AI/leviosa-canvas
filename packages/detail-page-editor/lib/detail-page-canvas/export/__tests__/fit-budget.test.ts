import { describe, expect, it, vi } from "vitest";

import {
  LOSSY_QUALITIES,
  SCALE_STEPS,
  dataUrlBytes,
  fitSteps,
  fitToBudget,
} from "../fit-budget";

describe("fitSteps", () => {
  it("손실 형식은 화질부터 내리고, 바닥 화질에서 크기를 줄인다", () => {
    const steps = fitSteps(true);
    const qualityPhase = steps.slice(0, LOSSY_QUALITIES.length);
    expect(qualityPhase.every((s) => s.scale === 1)).toBe(true);
    expect(qualityPhase.map((s) => s.quality)).toEqual([...LOSSY_QUALITIES]);

    const scalePhase = steps.slice(LOSSY_QUALITIES.length);
    const floor = LOSSY_QUALITIES[LOSSY_QUALITIES.length - 1];
    expect(scalePhase.every((s) => s.quality === floor)).toBe(true);
    expect(scalePhase.map((s) => s.scale)).toEqual(SCALE_STEPS.slice(1));
  });

  it("무손실 형식은 크기만 줄인다", () => {
    const steps = fitSteps(false);
    expect(steps.map((s) => s.scale)).toEqual([...SCALE_STEPS]);
    expect(steps.every((s) => s.quality === 1)).toBe(true);
  });

  it("첫 단계는 언제나 규격 폭 그대로다", () => {
    expect(fitSteps(true)[0].scale).toBe(1);
    expect(fitSteps(false)[0].scale).toBe(1);
  });
});

describe("fitToBudget", () => {
  it("상한이 없으면 한 번만 굽고 끝낸다", async () => {
    const encode = vi.fn(async () => ({ value: "x", bytes: 10_000_000 }));
    const fit = await fitToBudget(null, true, encode);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(fit.fitted).toBe(true);
    expect(fit.step).toEqual({ scale: 1, quality: LOSSY_QUALITIES[0] });
  });

  it("상한 안에 드는 첫 단계에서 멈춘다", async () => {
    // 화질 0.8 부터 상한 안에 든다고 치자.
    const encode = vi.fn(async (step: { quality: number }) => ({
      value: step.quality,
      bytes: step.quality >= 0.85 ? 2000 : 900,
    }));
    const fit = await fitToBudget(1000, true, encode);
    expect(fit.fitted).toBe(true);
    expect(fit.step.quality).toBe(0.8);
    expect(fit.step.scale).toBe(1);
    expect(encode).toHaveBeenCalledTimes(3);
  });

  it("끝까지 넘으면 가장 작은 결과를 돌려주되 넘었다고 말한다", async () => {
    const encode = vi.fn(async (step: { scale: number }) => ({
      value: step.scale,
      bytes: 5000,
    }));
    const fit = await fitToBudget(1000, false, encode);
    expect(fit.fitted).toBe(false);
    expect(fit.step.scale).toBe(SCALE_STEPS[SCALE_STEPS.length - 1]);
    expect(encode).toHaveBeenCalledTimes(SCALE_STEPS.length);
  });
});

describe("dataUrlBytes", () => {
  it("base64 길이에서 파일 크기를 역산한다", () => {
    // "hello" → aGVsbG8= (5 bytes)
    expect(dataUrlBytes("data:text/plain;base64,aGVsbG8=")).toBe(5);
    // "hi" → aGk= (2 bytes)
    expect(dataUrlBytes("data:text/plain;base64,aGk=")).toBe(2);
    // "abc" → YWJj (3 bytes, no padding)
    expect(dataUrlBytes("data:text/plain;base64,YWJj")).toBe(3);
  });
});
