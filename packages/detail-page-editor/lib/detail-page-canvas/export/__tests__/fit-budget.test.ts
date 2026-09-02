import { describe, expect, it, vi } from "vitest";

import {
  LOSSY_QUALITIES,
  SCALE_STEPS,
  dataUrlBytes,
  fitSteps,
  fitToBudget,
  pngFallbackSteps,
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
    expect(pngFallbackSteps()[0].scale).toBe(1);
  });

  it("PNG 사다리는 원본 PNG 한 칸 뒤에 JPG 사다리를 통째로 잇는다", () => {
    // PNG 는 화질 손잡이가 없다. 넘치면 크기를 줄이기 전에 JPG 로 바꾸는 편이 폭을
    // 더 오래 지킨다 — 사진이 든 페이지의 JPG 는 같은 폭 PNG 의 몇 분의 1이다.
    const steps = pngFallbackSteps();
    expect(steps[0]).toEqual({ scale: 1, quality: 1, lossy: false });
    expect(steps.slice(1)).toEqual(fitSteps(true));
    expect(steps.slice(1).every((s) => s.lossy)).toBe(true);
  });
});

describe("fitToBudget", () => {
  it("상한이 없으면 한 번만 굽고 끝낸다", async () => {
    const encode = vi.fn(async () => ({ value: "x", bytes: 10_000_000 }));
    const fit = await fitToBudget(null, fitSteps(true), encode);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(fit.fitted).toBe(true);
    expect(fit.step).toEqual({ scale: 1, quality: LOSSY_QUALITIES[0], lossy: true });
  });

  it("상한 안에 드는 첫 단계에서 멈춘다", async () => {
    // 화질 0.8 부터 상한 안에 든다고 치자.
    const encode = vi.fn(async (step: { quality: number }) => ({
      value: step.quality,
      bytes: step.quality >= 0.85 ? 2000 : 900,
    }));
    const fit = await fitToBudget(1000, fitSteps(true), encode);
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
    const fit = await fitToBudget(1000, fitSteps(false), encode);
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
