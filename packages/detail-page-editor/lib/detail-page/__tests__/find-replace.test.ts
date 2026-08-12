import { describe, expect, it } from "vitest";

import {
  collectTextMatches,
  countOccurrences,
  isChartGroup,
  replaceInText,
  stepIndex,
  totalOccurrences,
  type SearchPage,
} from "../find-replace";

const PAGES: SearchPage[] = [
  {
    id: "hero",
    children: [
      { id: "t1", type: "text", text: "30ml 한 병으로 30일" },
      { id: "img", type: "image" },
    ],
  },
  {
    id: "spec",
    children: [
      {
        id: "tbl",
        type: "group",
        custom: { table: { kind: "keyvalue" } },
        children: [{ id: "cell", type: "text", text: "용량 30ml" }],
      },
      {
        id: "cht",
        type: "group",
        custom: { chart: { kind: "bar-v" } },
        children: [{ id: "axis", type: "text", text: "30ml 기준" }],
      },
    ],
  },
];

describe("countOccurrences", () => {
  it("겹치지 않게 센다", () => {
    // 치환과 같은 셈법이어야 카운터가 "바꿀 자리 수"를 말한다.
    expect(countOccurrences("aaa", "aa")).toBe(1);
    expect(countOccurrences("30ml 30ml", "30ml")).toBe(2);
  });

  it("기본은 대소문자 무시", () => {
    expect(countOccurrences("Vita Vita", "vita")).toBe(2);
    expect(countOccurrences("Vita Vita", "vita", { caseSensitive: true })).toBe(0);
  });

  it("정규식 메타문자를 글자로 본다", () => {
    // 사용자가 "1.5" 를 치면 "125"가 잡히면 안 된다.
    expect(countOccurrences("125 1.5", "1.5")).toBe(1);
    expect(countOccurrences("(주)레비오사", "(주)")).toBe(1);
  });

  it("빈 검색어는 0", () => {
    expect(countOccurrences("아무거나", "")).toBe(0);
  });
});

describe("collectTextMatches", () => {
  it("텍스트 요소만, 문서 순서대로 잡는다", () => {
    const hits = collectTextMatches(PAGES, "30ml");
    expect(hits.map((h) => h.elementId)).toEqual(["t1", "cell"]);
    expect(hits[0]).toMatchObject({ pageId: "hero", count: 1 });
  });

  it("표 안 글자는 잡는다", () => {
    // 캔버스에서 고친 칸 글자는 harvestTableEdits가 스펙으로 걷어 올려 살아남는다.
    expect(collectTextMatches(PAGES, "용량").map((h) => h.elementId)).toEqual(["cell"]);
  });

  it("차트 안 글자는 세지도 않는다", () => {
    // 차트엔 harvest가 없어 다음 동기화에 되돌아간다 — 바꿀 수 없는 걸 세면 거짓말이다.
    expect(collectTextMatches(PAGES, "기준")).toEqual([]);
  });

  it("빈 검색어는 빈 목록", () => {
    expect(collectTextMatches(PAGES, "")).toEqual([]);
  });

  it("한 요소 안 여러 번은 count로 센다", () => {
    const pages: SearchPage[] = [
      { id: "p", children: [{ id: "a", type: "text", text: "라·라·라" }] },
    ];
    expect(collectTextMatches(pages, "라")[0].count).toBe(3);
    expect(totalOccurrences(collectTextMatches(pages, "라"))).toBe(3);
  });
});

describe("isChartGroup", () => {
  it("custom.chart가 있어야 차트다", () => {
    expect(isChartGroup({ id: "x", custom: { chart: {} } })).toBe(true);
    expect(isChartGroup({ id: "x", custom: { table: {} } })).toBe(false);
    expect(isChartGroup({ id: "x" })).toBe(false);
  });
});

describe("replaceInText", () => {
  it("전부 바꾼다", () => {
    expect(replaceInText("30ml 한 병 30ml", "30ml", "50ml")).toBe("50ml 한 병 50ml");
  });

  it("대소문자를 무시해도 원문 형태를 안 망친다", () => {
    // 자리는 소문자로 찾되, 잘라내기는 원문에서 한다.
    expect(replaceInText("Vita와 vita", "vita", "비타")).toBe("비타와 비타");
  });

  it("대소문자를 구분하면 딱 맞는 것만", () => {
    expect(replaceInText("Vita와 vita", "vita", "비타", { caseSensitive: true })).toBe(
      "Vita와 비타",
    );
  });

  it("바꿀 말의 $&가 특수문자로 안 샌다", () => {
    // String.replace였다면 "$&"가 매치 전체로 치환됐을 것이다.
    expect(replaceInText("가격", "가격", "$& 원")).toBe("$& 원");
  });

  it("검색어의 메타문자도 글자다", () => {
    expect(replaceInText("125 1.5", "1.5", "2.0")).toBe("125 2.0");
  });

  it("빈 검색어는 원문 그대로", () => {
    expect(replaceInText("그대로", "", "X")).toBe("그대로");
  });

  it("빈 문자열로 지울 수 있다", () => {
    expect(replaceInText("불필요한 말", "불필요한 ", "")).toBe("말");
  });
});

describe("stepIndex", () => {
  it("끝에서 감아 돈다", () => {
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(0, 3, -1)).toBe(2);
  });

  it("비었으면 null", () => {
    expect(stepIndex(0, 0, 1)).toBeNull();
  });
});
