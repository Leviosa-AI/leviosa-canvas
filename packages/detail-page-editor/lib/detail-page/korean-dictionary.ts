/**
 * 사전에 없는 한국어 낱말을 **국립국어원 한국어기초사전**에 한 번 물어본다.
 *
 * 아이콘 검색의 한국어는 사전 세 겹으로 받는다.
 *
 *  1. `ICON_KEYWORDS_KO` — 손으로 고른 상세페이지 말투. 순서까지 사람이 정한다.
 *  2. `ICON_KEYWORDS_GENERATED` — Wiktionary에서 구운 것. 아이콘 이름에 실제로
 *     있는 낱말로만 한정된다.
 *  3. **여기** — 앞의 둘이 다 놓친 말. 국립국어원은 표제어 5만에 영어 대역어를 달고
 *     있어서, 우리가 미리 예상하지 못한 말도 옮겨 준다.
 *
 * 이 층은 **없어도 되게** 만들었다. 키가 없거나, 하루 몫을 다 썼거나, 제공처가 죽으면
 * 빈 배열을 돌려주고 검색은 앞의 두 사전만으로 계속 간다 — 결과가 조금 성길 뿐
 * 오류로 끝나지 않는다.
 *
 * 키는 서버에만 있다(`NEXT_PUBLIC_` 아님). 이 모듈은 라우트 핸들러에서만 부른다.
 */

const ENDPOINT = "https://krdict.korean.go.kr/api/search";

/**
 * 제공처 앞단이 표기 없는 요청을 `<H1>Request Blocked</H1>`로 되돌린다. 키가 맞아도
 * 400이 오므로 키 문제로 착각하기 쉽다 — 브라우저 표기를 붙여야 통과한다.
 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** 제공처가 10 미만을 거절한다(`Invalid num value`). */
const NUM = 10;

/**
 * 한 사람이 하루에 쓸 수 있는 조회 수.
 *
 * 제공처 몫은 하루 5만이다. 한 사람이 그것을 다 태우면 나머지 전부가 조용히 나빠지므로
 * 훨씬 낮은 자리에서 먼저 멈춘다. 캐시가 앞에 있어서 **처음 보는 낱말**만 여기 닿는다 —
 * 100번이면 사람 하나가 하루에 새로 쳐 볼 만한 한국어를 넉넉히 덮는다.
 */
export const DAILY_LOOKUP_LIMIT = 100;

/** 옮긴 말은 오래 들고 있는다 — 사전은 안 변한다. */
const CACHE_TTL_MS = 12 * 60 * 60_000;
const CACHE_MAX_ENTRIES = 2_000;

type CacheEntry = { value: string[]; expiry: number };
const cache = new Map<string, CacheEntry>();

function readCache(word: string): string[] | null {
  const hit = cache.get(word);
  if (!hit) return null;
  if (Date.now() >= hit.expiry) {
    cache.delete(word);
    return null;
  }
  return hit.value;
}

function writeCache(word: string, value: string[]): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(word, { value, expiry: Date.now() + CACHE_TTL_MS });
}

/** 하루가 바뀌는 자리. 서버 시각 기준이라 자정 언저리에 한 번 헐거워질 수 있다. */
export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const spent = new Map<string, { day: string; count: number }>();

/**
 * 이 사람 몫에서 한 번 빼낸다. 남아 있으면 `true`.
 *
 * 프로세스 메모리라 인스턴스마다 따로 센다 — 정확한 통제가 아니라 **한 사람이 제공처
 * 몫을 통째로 태우는 것**을 막는 헐거운 울타리다. 그 이상이 필요해지면 여기만 갈아
 * 끼우면 된다(호출부는 불리언만 본다).
 */
export function takeDailyBudget(userId: string, now: Date = new Date()): boolean {
  const today = dayKey(now);
  const seen = spent.get(userId);
  if (!seen || seen.day !== today) {
    spent.set(userId, { day: today, count: 1 });
    return true;
  }
  if (seen.count >= DAILY_LOOKUP_LIMIT) return false;
  seen.count += 1;
  return true;
}

/** 테스트에서 하루치를 되돌린다. */
export function resetKoreanDictionaryState(): void {
  spent.clear();
  cache.clear();
}

/**
 * 응답에서 영어 대역어만 뽑는다.
 *
 * 값이 `<![CDATA[...]]>`로 싸여 오고 사이사이 탭·줄바꿈이 잔뜩 낀 XML이라 파서를
 * 들이지 않고 필요한 태그만 훑는다. 태그 하나가 얕고 이름이 고유해서 그것으로 충분하다.
 */
export function parseTransWords(xml: string): string[] {
  const out: string[] = [];
  const pattern = /<trans_word>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/trans_word>/g;
  for (const match of xml.matchAll(pattern)) {
    const word = normalizeTranslation(match[1]);
    if (word && !out.includes(word)) out.push(word);
  }
  return out;
}

/**
 * 대역어 한 줄을 견줄 수 있는 낱말로 다듬는다.
 *
 * 사전은 `apple`처럼 한 낱말도 주지만 `refrigerator, fridge`처럼 여럿을 한 칸에
 * 담거나 `delivery (of goods)`처럼 괄호를 달기도 한다. 아이콘 이름과 견주려면
 * **첫 낱말 덩어리 하나**면 된다.
 */
function normalizeTranslation(raw: string): string {
  const first = raw.split(/[,;/]/)[0] ?? "";
  return first
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^A-Za-z\s-]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** 키가 있는가. 없으면 이 층은 통째로 꺼진다. */
export function hasKoreanDictionaryKey(): boolean {
  return Boolean(process.env.KOREAN_DICTIONARY_API_KEY);
}

export type LookupOptions = {
  userId: string;
  signal?: AbortSignal;
  /** 테스트에서 하루 경계를 고정한다. */
  now?: Date;
};

/**
 * 한국어 낱말 하나를 영어로. 못 옮기면 **빈 배열**이다(던지지 않는다).
 *
 * 캐시가 먼저다 — 캐시에 있으면 하루 몫을 쓰지 않는다. 이미 물어봐서 없다는 것을 안
 * 낱말도 캐시에 남으므로 같은 말을 계속 두드리지 않는다.
 */
export async function lookupKorean(
  word: string,
  { userId, signal, now }: LookupOptions,
): Promise<string[]> {
  const key = process.env.KOREAN_DICTIONARY_API_KEY;
  if (!key) return [];

  const term = word.trim();
  if (!term) return [];

  const cached = readCache(term);
  if (cached) return cached;

  if (!takeDailyBudget(userId, now)) return [];

  const url = new URL(ENDPOINT);
  url.searchParams.set("key", key);
  url.searchParams.set("q", term);
  url.searchParams.set("part", "word");
  url.searchParams.set("sort", "popular");
  url.searchParams.set("num", String(NUM));
  url.searchParams.set("translated", "y");
  // 1 = 영어.
  url.searchParams.set("trans_lang", "1");

  try {
    const response = await fetch(url, {
      signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/xml" },
    });
    if (!response.ok) return [];
    const words = parseTransWords(await response.text());
    writeCache(term, words);
    return words;
  } catch {
    // 시간 초과·중단·제공처 장애. 이 층 없이 계속 간다.
    return [];
  }
}
