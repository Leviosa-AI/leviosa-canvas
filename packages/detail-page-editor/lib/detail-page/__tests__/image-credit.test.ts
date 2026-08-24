import { describe, expect, it } from "vitest";

import {
  DEFAULT_IMAGE_TIER,
  IMAGE_FEATURE_KEYS,
  IMAGE_TIERS,
  IMAGE_TIER_FALLBACK_COST,
  IMAGE_TIER_META,
  imageCreditRequired,
  imageFeatureKey,
  isImageCreditBlocked,
  resolveDefaultImageTier,
  resolveImageTiers,
} from "../image-credit";

describe("imageFeatureKey", () => {
  it("티어별 feature 키를 돌려주고, 미지정/미지원은 기본 pro로", () => {
    expect(imageFeatureKey("max")).toBe(IMAGE_FEATURE_KEYS.max);
    expect(imageFeatureKey("basic")).toBe(IMAGE_FEATURE_KEYS.basic);
    expect(imageFeatureKey()).toBe(IMAGE_FEATURE_KEYS.pro);
    expect(imageFeatureKey("bogus")).toBe(IMAGE_FEATURE_KEYS.pro);
  });
});

describe("imageCreditRequired", () => {
  it("비용의 1.5배를 올림", () => {
    expect(imageCreditRequired(50)).toBe(75);
    expect(imageCreditRequired(10)).toBe(15);
    expect(imageCreditRequired(7)).toBe(11); // ceil(10.5)
    expect(imageCreditRequired(0)).toBe(0);
  });
});

describe("isImageCreditBlocked", () => {
  it("잔액이 1.5배 미만이면 차단", () => {
    expect(isImageCreditBlocked(50, 74)).toBe(true); // 75 필요
    expect(isImageCreditBlocked(50, 75)).toBe(false);
    expect(isImageCreditBlocked(50, 200)).toBe(false);
  });

  it("비용 0(미구성)이면 항상 허용", () => {
    expect(isImageCreditBlocked(0, 0)).toBe(false);
  });
});

describe("이미지 티어 메타/대체단가", () => {
  it("드롭다운 순서는 basic→pro→max, 기본은 pro", () => {
    expect(IMAGE_TIERS).toEqual(["basic", "pro", "max"]);
    expect(DEFAULT_IMAGE_TIER).toBe("pro");
  });

  it("각 티어에 라벨·품질·설명·대체단가가 있고, pro만 추천 배지", () => {
    for (const tier of IMAGE_TIERS) {
      const meta = IMAGE_TIER_META[tier];
      expect(meta.label).toBeTruthy();
      expect(meta.quality).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(meta.fallbackCost).toBeGreaterThan(0);
    }
    expect(IMAGE_TIER_META.pro.badge).toBe("추천");
    expect(IMAGE_TIER_META.basic.badge).toBeUndefined();
  });

  it("대체단가 맵은 메타의 fallbackCost와 일치(중앙 feature_costs 기준값)", () => {
    expect(IMAGE_TIER_FALLBACK_COST).toEqual({
      basic: IMAGE_TIER_META.basic.fallbackCost,
      pro: IMAGE_TIER_META.pro.fallbackCost,
      max: IMAGE_TIER_META.max.fallbackCost,
    });
    // 저→고 품질일수록 비싸다(basic < pro < max).
    expect(IMAGE_TIER_FALLBACK_COST.basic).toBeLessThan(
      IMAGE_TIER_FALLBACK_COST.pro,
    );
    expect(IMAGE_TIER_FALLBACK_COST.pro).toBeLessThan(
      IMAGE_TIER_FALLBACK_COST.max,
    );
  });
});

describe("resolveImageTiers", () => {
  it("소비자가 고른 티어만, 늘 저→고 순서로", () => {
    expect(resolveImageTiers(["max", "pro"])).toEqual(["pro", "max"]);
    expect(resolveImageTiers(["pro"])).toEqual(["pro"]);
  });

  it("안 주면 셋 다 — 지금까지 소비자의 화면이 안 바뀐다", () => {
    expect(resolveImageTiers()).toEqual(IMAGE_TIERS);
  });

  it("빈 목록·모르는 이름은 셋 다로 되돌린다", () => {
    // 빈 드롭다운은 'AI 이미지를 못 만드는 편집기'다. 배열 하나를 잘못 넘겨서
    // 벌어질 일이 아니다.
    expect(resolveImageTiers([])).toEqual(IMAGE_TIERS);
    expect(resolveImageTiers(["nope" as never])).toEqual(IMAGE_TIERS);
  });
});

describe("resolveDefaultImageTier", () => {
  it("목록에 기본값이 있으면 그것", () => {
    expect(resolveDefaultImageTier(["pro", "max"])).toBe(DEFAULT_IMAGE_TIER);
  });

  it("기본값이 은퇴한 목록이면 첫 항목", () => {
    expect(resolveDefaultImageTier(["max"])).toBe("max");
  });
});
