import { describe, expect, it } from "vitest";

import {
  ICON_KEYWORDS_KO,
  expandKoreanQuery,
} from "../icon-keywords.ko";

describe("ICON_KEYWORDS_KO", () => {
  const entries = Object.entries(ICON_KEYWORDS_KO);

  it("상세페이지에서 실제로 쓰이는 양을 담는다", () => {
    expect(entries.length).toBeGreaterThanOrEqual(250);
  });

  it("키가 전부 한글이나 숫자다 — 영어 키는 사전을 탈 이유가 없다", () => {
    for (const [key] of entries) {
      expect(key, `키 "${key}"`).toMatch(/^[0-9가-힣]+$/);
    }
  });

  it("값이 전부 비어 있지 않고 영어 소문자 키워드다", () => {
    for (const [key, words] of entries) {
      expect(words.length, `키 "${key}"`).toBeGreaterThan(0);
      for (const word of words) {
        expect(word, `키 "${key}"`).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });

  it("한 키 안에 같은 키워드를 두 번 담지 않는다", () => {
    for (const [key, words] of entries) {
      expect(new Set(words).size, `키 "${key}"`).toBe(words.length);
    }
  });

  it("배송·결제·인증처럼 반드시 있어야 하는 말이 있다", () => {
    for (const key of ["배송", "무료배송", "교환", "반품", "환불", "정품", "인증", "성분", "사이즈", "유통기한", "후기", "할인"]) {
      expect(ICON_KEYWORDS_KO[key], `키 "${key}"`).toBeDefined();
    }
  });
});

describe("expandKoreanQuery", () => {
  it("한글 질의를 영어 키워드로 편다", () => {
    expect(expandKoreanQuery("배송")).toEqual(["truck", "package", "delivery"]);
  });

  it("1순위가 맨 앞이다", () => {
    expect(expandKoreanQuery("환불")[0]).toBe("arrow-back-up");
  });

  it("영어는 그대로 넘긴다 — 영어로 치는 사람을 막지 않는다", () => {
    expect(expandKoreanQuery("truck")).toEqual(["truck"]);
    expect(expandKoreanQuery("shopping cart")).toEqual(["shopping cart"]);
  });

  it("조사를 떼고 찾는다", () => {
    expect(expandKoreanQuery("배송은")).toEqual(ICON_KEYWORDS_KO["배송"] as string[]);
  });

  it("공백과 기호를 무시한다", () => {
    expect(expandKoreanQuery(" 무료 배송! ")).toEqual(
      ICON_KEYWORDS_KO["무료배송"] as string[],
    );
  });

  it("어절이 여럿이면 순서대로 이어 붙인다", () => {
    const result = expandKoreanQuery("배송 교환");
    expect(result[0]).toBe("truck");
    expect(result).toContain("arrows-exchange");
  });

  it("사전에 없는 말은 가장 긴 부분일치로 떨어진다", () => {
    // "당일배송"은 키가 아니지만 "배송"이 들어 있다.
    expect(expandKoreanQuery("당일배송")).toEqual(ICON_KEYWORDS_KO["배송"] as string[]);
  });

  it("부분일치는 긴 키를 먼저 본다", () => {
    // "무료배송"과 "배송"이 둘 다 걸리지만 긴 쪽이 이긴다.
    expect(expandKoreanQuery("우리는무료배송해요")).toEqual(
      ICON_KEYWORDS_KO["무료배송"] as string[],
    );
  });

  it("한 글자 키는 부분일치에서 뺀다 — 오탐이 크다", () => {
    // "면"(면직물 → shirt)이 "화면"에 걸리면 안 된다. 구운 사전이 "화면"을 제대로
    // 옮겨 주는 지금도, 그 답이 한 글자 키에서 나온 것이면 안 된다.
    const words = expandKoreanQuery("화면");
    expect(words).not.toContain("shirt");
    expect(words).toContain("screen");
  });

  it("아무것도 못 찾으면 원문을 그대로 넘긴다", () => {
    expect(expandKoreanQuery("끄떡없쥬")).toEqual(["끄떡없쥬"]);
  });

  it("빈 질의는 빈 배열", () => {
    expect(expandKoreanQuery("")).toEqual([]);
    expect(expandKoreanQuery("   ")).toEqual([]);
  });
});

describe("구운 사전이 받는 자리", () => {
  it("손사전에 없던 말도 옮긴다", () => {
    // "사과"가 0건이던 자리. 이제 구운 사전이 받는다.
    expect(expandKoreanQuery("사과")).toContain("apple");
    expect(expandKoreanQuery("가위")).toContain("scissors");
    expect(expandKoreanQuery("고양이")).toContain("cat");
  });

  it("소리로 못 닿는 외래어도 사전이 덮는다", () => {
    // `icon-fuzzy`가 일부러 포기한 말들이다 — 여기서 받아야 검색이 성글지 않다.
    expect(expandKoreanQuery("헤드폰")).toContain("headphones");
    expect(expandKoreanQuery("트럭")).toContain("truck");
    expect(expandKoreanQuery("셔츠")).toContain("shirt");
  });

  it("손으로 고른 순서를 자동 생성이 밀어내지 않는다", () => {
    // 어느 것이 1순위인지는 사람만 안다. 구운 사전에도 "배송"이 있지만 손사전이 이긴다.
    expect(expandKoreanQuery("배송")[0]).toBe("truck");
  });

  it("한 글자 표제어는 부분일치에서 빠진다", () => {
    // 구운 사전이 커지면서 "면"·"자" 같은 키가 아무 데나 걸릴 위험이 늘었다.
    expect(expandKoreanQuery("화면")).not.toContain("shirt");
  });
});
