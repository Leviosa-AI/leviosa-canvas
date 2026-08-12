import { describe, expect, it } from "vitest";

import { romanizeHangul, hasHangul } from "../hangul-roman";
import {
  MATCH_EXACT,
  MATCH_FUZZY,
  MATCH_NONE,
  MATCH_PARTIAL,
  editDistance,
  koreanSkeleton,
  matchTier,
  pronunciationVariants,
  skeleton,
  tierIds,
} from "../icon-fuzzy";

/**
 * 검색이 새던 두 자리를 막는 층이다.
 *  - 오타 한 글자에 0건(`aple`)
 *  - 사전에 없는 외래어에 0건("애플")
 *
 * 그리고 **순서**. 비슷한 것을 정확한 것과 섞으면 검색이 나빠진다.
 */

describe("한글 로마자", () => {
  it("첫소리·가운뎃소리·끝소리를 차례로 적는다", () => {
    expect(romanizeHangul("애플")).toBe("aepeul");
    expect(romanizeHangul("사과")).toBe("sagwa");
    expect(romanizeHangul("트럭")).toBe("teureok");
  });

  it("한글이 아닌 글자는 그대로 지나간다", () => {
    expect(romanizeHangul("A급 100%")).toBe("Ageup 100%");
    expect(hasHangul("apple")).toBe(false);
    expect(hasHangul("애플")).toBe(true);
  });
});

describe("자리표", () => {
  it("겹글자·묵음e·표기 흔들림을 뭉갠다", () => {
    expect(skeleton("apple")).toBe("apl");
    expect(skeleton("camera")).toBe("kamera");
    expect(skeleton("box")).toBe("boks");
    expect(skeleton("phone")).toBe("fon");
  });

  it("한국어가 끼워 넣는 모음을 뺀다 — 그래야 영어와 만난다", () => {
    expect(koreanSkeleton("애플")).toBe(skeleton("apple"));
    expect(koreanSkeleton("카메라")).toBe(skeleton("camera"));
    expect(koreanSkeleton("트럭")).toBe("trok");
  });
});

describe("편집 거리", () => {
  it("한 글자 차이를 1로 센다", () => {
    expect(editDistance("apl", "apl")).toBe(0);
    expect(editDistance("aple", "apple")).toBe(1);
    expect(editDistance("truk", "trok")).toBe(1);
  });

  it("한도를 넘으면 그 자리에서 그만둔다", () => {
    // 정확한 값이 아니라 "한도 초과"만 알면 된다.
    expect(editDistance("abc", "xyzxyzxyz", 2)).toBeGreaterThan(2);
  });
});

describe("등급 매기기", () => {
  it("이름이 곧 그 말이면 최고 등급", () => {
    expect(matchTier("truck", ["truck"])).toBe(MATCH_EXACT);
    // 변형까지 정확히 맞은 것으로 친다 — `apple`을 쳤는데 `apple-fill`이 밀리면 안 된다.
    expect(matchTier("apple-fill", ["apple"])).toBe(MATCH_EXACT);
  });

  it("이름 안에 조각으로 들어 있으면 그 아래", () => {
    expect(matchTier("truck-delivery", ["delivery"])).toBe(MATCH_PARTIAL);
    expect(matchTier("shopping-cart", ["cart"])).toBe(MATCH_PARTIAL);
  });

  it("오타 한 글자는 마지막 등급으로 건진다", () => {
    expect(matchTier("apple", ["aple"])).toBe(MATCH_FUZZY);
    expect(matchTier("camera", ["camara"])).toBe(MATCH_FUZZY);
  });

  it("사전에 없는 외래어를 소리로 되짚는다", () => {
    // 이게 이 층을 만든 이유다 — "애플"은 사전에 없다.
    expect(matchTier("apple", ["애플"])).toBe(MATCH_FUZZY);
    expect(matchTier("camera", ["카메라"])).toBe(MATCH_FUZZY);
  });

  it("남남인 말은 안 걸린다", () => {
    expect(matchTier("truck", ["apple"])).toBe(MATCH_NONE);
    expect(matchTier("calendar", ["애플"])).toBe(MATCH_NONE);
  });

  it("두 글자짜리 자리표로는 유사 판정을 안 한다", () => {
    // 짧은 말은 한 글자만 틀려도 완전히 다른 말이 된다.
    expect(matchTier("cat", ["car"])).toBe(MATCH_NONE);
  });
});

describe("tierIds", () => {
  it("등급별로 갈라 담는다 — 세트 이름은 안 본다", () => {
    const { exact, partial, fuzzy } = tierIds(
      ["lucide:apple", "ph:apple-fill", "tabler:apple-pie", "lucide:truck", "ph:aple"],
      ["apple"],
    );
    expect(exact).toEqual(["lucide:apple", "ph:apple-fill", "tabler:apple-pie"]);
    expect(partial).toEqual([]);
    expect(fuzzy).toEqual(["ph:aple"]);
  });
});

describe("흐리게 견줄 말 고르기", () => {
  it("사전이 옮겨 준 낱말로는 유사 판정을 안 한다", () => {
    // "별점"의 사전 낱말 `stars`로 흐리게 견주면 `align-start`가 79건 딸려 온다.
    expect(matchTier("align-start-horizontal", ["stars"], ["별점"])).toBe(MATCH_NONE);
    // 사용자가 직접 `stars`를 쳤다면 그때는 봐준다.
    expect(matchTier("align-start-horizontal", ["stars"], ["stars"])).toBe(MATCH_FUZZY);
  });

  it("정확·부분 판정은 사전 낱말에도 그대로 적용된다", () => {
    expect(matchTier("star-half", ["star"], ["별점"])).toBe(MATCH_EXACT);
    expect(matchTier("moon-star", ["star"], ["별점"])).toBe(MATCH_PARTIAL);
  });
});

describe("소리 후보", () => {
  it("흔들리는 자리를 되돌린 것들을 함께 낸다", () => {
    const made = pronunciationVariants("pilto");
    // ㅍ은 p이자 f고, 끝의 ㅓ는 영어의 약모음 자리다.
    expect(made).toContain("filter");
    expect(made).toContain("pilto");
  });

  it("ㄹ과 종성 ㅇ도 되돌린다", () => {
    expect(pronunciationVariants("ringk")).toContain("link");
  });

  it("너무 짧은 말은 아예 펴지 않는다", () => {
    // 두 글자에서 후보를 펴면 아무 이름에나 걸린다.
    expect(pronunciationVariants("kp")).toEqual([]);
  });

  it("후보가 걷잡을 수 없이 불어나지 않는다", () => {
    // 이름마다 견주는 자리라 크기가 곧 비용이다.
    expect(pronunciationVariants("printo").length).toBeLessThan(64);
  });
});

describe("외래어를 소리로 되짚기", () => {
  it.each([
    ["필터", "filter"],
    ["폴더", "folder"],
    ["링크", "link"],
    ["프린터", "printer"],
    ["애플", "apple"],
    ["카메라", "camera"],
  ])("%s → %s", (korean, name) => {
    expect(matchTier(name, [korean])).toBeGreaterThanOrEqual(MATCH_FUZZY);
  });

  it.each([
    ["헤드폰", "headphone"],
    ["트럭", "truck"],
    ["박스", "box"],
  ])("%s는 소리만으로는 못 닿는다 — 사전이 받는 자리다", (korean, name) => {
    // 한국어가 영어 모음을 받아 적는 방식은 규칙이 없다("헤"가 `hea`, "트"가 `tru`).
    // 여기까지 후보를 펴면 관계없는 이름이 수백 개씩 딸려 온다. 이 말들은 손사전과
    // 구운 사전이 이미 덮고 있으므로(`icon-keywords.test.ts`) 소리 층은 욕심내지 않는다.
    expect(matchTier(name, [korean])).toBe(MATCH_NONE);
  });

  it("이름 쪽 자리표는 그대로 둔다 — `folder`와 `fold`가 같아지면 안 된다", () => {
    // 자리표를 더 뭉개는 길로 갔다면 "폴더"가 `calendar-fold` 계열을 물어 왔다(실측 415건).
    expect(skeleton("folder")).not.toBe(skeleton("fold"));
  });

  it("사전이 옮겨 준 영어에는 소리 후보를 안 편다", () => {
    // 흐리게 볼 말을 사용자가 친 것으로만 한정한다.
    expect(matchTier("filter", ["필터"], [])).toBe(MATCH_NONE);
  });

  it("영어로 친 말은 오타만 봐준다", () => {
    expect(matchTier("truck", ["trcuk"])).toBe(MATCH_FUZZY);
    expect(matchTier("front", ["print"])).toBe(MATCH_NONE);
  });
});
