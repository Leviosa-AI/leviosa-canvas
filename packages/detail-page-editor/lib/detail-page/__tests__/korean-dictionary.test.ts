import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DAILY_LOOKUP_LIMIT,
  dayKey,
  hasKoreanDictionaryKey,
  lookupKorean,
  parseTransWords,
  resetKoreanDictionaryState,
  takeDailyBudget,
} from "../korean-dictionary";

/** 제공처가 실제로 주는 모양 — 값은 CDATA로 싸여 오고 사이에 탭·줄바꿈이 잔뜩 낀다. */
function xmlFor(...words: string[]): string {
  const senses = words
    .map(
      (word) => `\t\t\t<translation>\n\t\t\t\t<trans_lang>\n\t\t\t\t\n\t\t\t\t영어\n\t\t\t\t\n` +
        `\t\t\t\t</trans_lang>\n\t\t\t\t<trans_word><![CDATA[${word}]]></trans_word>\n` +
        `\t\t\t\t<trans_dfn><![CDATA[A thing. ]]></trans_dfn>\n\t\t\t</translation>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<channel>\n\t<total>1</total>\n\t<item>\n` +
    `\t\t<word>사과</word>\n\t\t<pos>명사</pos>\n\t\t<sense>\n${senses}\n\t\t</sense>\n\t</item>\n</channel>`;
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "application/xml" } });
}

describe("parseTransWords", () => {
  it("CDATA로 싸인 대역어를 꺼낸다", () => {
    expect(parseTransWords(xmlFor("apple"))).toEqual(["apple"]);
  });

  it("같은 말이 여러 번 나와도 한 번만 담는다", () => {
    expect(parseTransWords(xmlFor("apple", "apple", "apology"))).toEqual(["apple", "apology"]);
  });

  it("한 칸에 여럿이 담겨 오면 첫 낱말만 쓴다", () => {
    // 사전은 `refrigerator, fridge`처럼 쉼표로 잇거나 괄호를 달아 준다.
    expect(parseTransWords(xmlFor("refrigerator, fridge"))).toEqual(["refrigerator"]);
    expect(parseTransWords(xmlFor("delivery (of goods)"))).toEqual(["delivery"]);
  });

  it("대역어가 없는 응답은 빈 배열이다", () => {
    expect(parseTransWords("<channel><total>0</total></channel>")).toEqual([]);
  });
});

describe("takeDailyBudget", () => {
  beforeEach(() => {
    resetKoreanDictionaryState();
  });

  it("하루 몫 안에서는 계속 내준다", () => {
    const now = new Date("2026-08-11T03:00:00Z");
    for (let i = 0; i < DAILY_LOOKUP_LIMIT; i += 1) {
      expect(takeDailyBudget("user-1", now)).toBe(true);
    }
  });

  it("몫을 다 쓰면 그 사람만 막는다", () => {
    const now = new Date("2026-08-11T03:00:00Z");
    for (let i = 0; i < DAILY_LOOKUP_LIMIT; i += 1) takeDailyBudget("user-1", now);

    expect(takeDailyBudget("user-1", now)).toBe(false);
    // 옆 사람 몫은 그대로다 — 제공처 몫을 한 사람이 태우는 것만 막는다.
    expect(takeDailyBudget("user-2", now)).toBe(true);
  });

  it("날이 바뀌면 다시 채워진다", () => {
    const today = new Date("2026-08-11T23:00:00Z");
    for (let i = 0; i < DAILY_LOOKUP_LIMIT; i += 1) takeDailyBudget("user-1", today);
    expect(takeDailyBudget("user-1", today)).toBe(false);

    expect(takeDailyBudget("user-1", new Date("2026-08-12T00:30:00Z"))).toBe(true);
  });

  it("dayKey는 날짜까지만 본다", () => {
    expect(dayKey(new Date("2026-08-11T23:59:59Z"))).toBe("2026-08-11");
  });
});

describe("lookupKorean", () => {
  beforeEach(() => {
    resetKoreanDictionaryState();
    vi.stubEnv("KOREAN_DICTIONARY_API_KEY", "0".repeat(32));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("한국어를 영어로 옮긴다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(xmlFor("apple"))));
    await expect(lookupKorean("사과", { userId: "user-1" })).resolves.toEqual(["apple"]);
  });

  it("키가 없으면 제공처를 두드리지 않는다", async () => {
    vi.stubEnv("KOREAN_DICTIONARY_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupKorean("사과", { userId: "user-1" })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(hasKoreanDictionaryKey()).toBe(false);
  });

  it("한 번 물어본 말은 캐시에서 답한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(xmlFor("apple")));
    vi.stubGlobal("fetch", fetchMock);

    await lookupKorean("사과", { userId: "user-1" });
    await lookupKorean("사과", { userId: "user-2" });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("하루 몫을 다 쓰면 조용히 빈손으로 돌아온다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(xmlFor("apple")));
    vi.stubGlobal("fetch", fetchMock);
    const now = new Date("2026-08-11T03:00:00Z");

    // 캐시가 안 받게 매번 다른 말을 묻는다.
    for (let i = 0; i < DAILY_LOOKUP_LIMIT; i += 1) {
      await lookupKorean(`낱말${i}`, { userId: "user-1", now });
    }
    const calls = fetchMock.mock.calls.length;

    await expect(lookupKorean("새로운말", { userId: "user-1", now })).resolves.toEqual([]);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("제공처가 죽어도 던지지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(lookupKorean("사과", { userId: "user-1" })).resolves.toEqual([]);
  });

  it("차단 응답도 빈손으로 넘긴다", async () => {
    // 표기 없는 요청은 제공처 앞단이 400 HTML로 되돌린다.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(textResponse("<HTML><H1>Request Blocked</H1></HTML>", 400)),
    );
    await expect(lookupKorean("사과", { userId: "user-1" })).resolves.toEqual([]);
  });

  it("키를 질의에 담고 영어 대역어를 요청한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(xmlFor("apple")));
    vi.stubGlobal("fetch", fetchMock);

    await lookupKorean("사과", { userId: "user-1" });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("q")).toBe("사과");
    expect(url.searchParams.get("translated")).toBe("y");
    expect(url.searchParams.get("trans_lang")).toBe("1");
    // 제공처가 10 미만을 거절한다.
    expect(Number(url.searchParams.get("num"))).toBeGreaterThanOrEqual(10);
    // 표기를 안 붙이면 앞단이 막는다.
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String((init.headers as Record<string, string>)["User-Agent"])).toContain("Mozilla");
  });
});
