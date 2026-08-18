import { expandKoreanQuery } from "../lib/detail-page/icon-keywords.ko";
import { lookupKorean } from "../lib/detail-page/korean-dictionary";
import { hasHangul } from "../lib/detail-page/hangul-roman";
import { tierIds } from "../lib/detail-page/icon-fuzzy";
import { curatedFor, ICON_PREFIXES } from "../lib/detail-page/icon-curated";
import {
  groupByPrefix,
  rankIcons,
  type IconCollectionMeta,
  type IconHit,
  type IconStyle,
} from "../lib/detail-page/icon-search";
import type {
  IconGroup,
  IconItem,
  IconSearchResponse,
} from "../lib/detail-page/icons";
import {
  authorizeRequest,
  getJson,
  isResponse,
  json,
  makeCache,
  type EditorRouteOptions,
} from "./route-kit";

/**
 * 아이콘 검색 프록시(Iconify) — 소비자가 마운트하는 라우트.
 *
 * ```ts
 * // app/api/icons/route.ts
 * export { GET } from "@leviosa-ai/detail-page-editor/server/icons";
 * ```
 *
 * 키가 없는 공개 API라 `/api/stock-photos`처럼 "키를 감추려고" 서버를 거치는 것이 아니다.
 * 서버를 거치는 이유는 셋이다.
 *
 *  1. **라이선스 게이트.** 세트 이름 목록을 손으로 관리하지 않고 제공처가 주는
 *     `license.spdx`로 거른다(`isAllowedCollection`). 상류가 바뀌어도 무단 자산이
 *     브라우저까지 못 온다.
 *  2. **한국어.** 제공처는 영어 이름·별칭만 본다. "배송"은 그대로 넘기면 0건이라
 *     `expandKoreanQuery`로 펴서 넘긴다.
 *  3. **마크업까지 한 번에.** 격자를 그리려면 어차피 SVG가 필요하다. 브라우저가
 *     아이콘마다 제공처를 두드리는 대신 세트당 한 번 배치로 받아 함께 내린다.
 *
 * 캐시는 `/api/stock-photos`와 같은 모양의 프로세스 메모리 LRU다.
 */

const ICONIFY = "https://api.iconify.design";

/** 브랜드 로고는 성격이 달라 따로 판다(상표 문제 — 패널이 안내를 띄운다). */
const LOGO_PREFIXES = ["simple-icons"] as const;

/** 제공처는 32 미만을 줘도 32로 올린다. 넉넉히 받아 접은 뒤 잘라 낸다. */
const RAW_LIMIT = 600;
/**
 * 접은 뒤 들고 있는 전체 상한. 이 목록을 쪽으로 잘라 내려보낸다.
 *
 * 큐레이션만으로 300을 넘으므로 600이면 둘러보기의 절반이 큐레이션이다. 900으로 둬야
 * 큐레이션 뒤로도 볼 것이 남는다. 검색은 `RAW_LIMIT`(600)에서 이미 잘리니 영향이 없다.
 */
const MAX_ITEMS = 900;
/** 한 번에 내려보내는 개수. 격자가 5열이니 12줄이다. */
const PAGE_SIZE = 60;
/** 이만큼도 못 채우면 시소러스의 다음 순위 키워드로 한 번 더 찾는다. */
const THIN_RESULT = PAGE_SIZE * 2;
/** 키워드를 몇 개까지 태울지. 뒤로 갈수록 질의와 멀어진다. */
const MAX_KEYWORDS = 3;

const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX_ENTRIES = 200;

type IconifySearch = {
  icons?: string[];
  total?: number;
  collections?: Record<string, IconCollectionMeta>;
};

type IconifyIconData = {
  body?: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
};

type IconifySet = {
  prefix?: string;
  width?: number;
  height?: number;
  icons?: Record<string, IconifyIconData>;
  aliases?: Record<string, { parent?: string }>;
};

/**
 * 프로세스 메모리 LRU. 둘로 나눠 둔다.
 *
 * 순위 목록(`hitsCache`)은 질의 하나당 한 번만 만들면 되고, 쪽 응답(`pageCache`)은
 * 마크업까지 붙은 결과다. 스크롤로 2쪽을 부를 때 제공처 검색을 다시 태우지 않으려면
 * 이 둘이 갈려 있어야 한다.
 */
const pageCache = makeCache<IconSearchResponse>(
  CACHE_TTL_MS,
  CACHE_MAX_ENTRIES,
);
const hitsCache = makeCache<{
  hits: IconHit[];
  collections: Record<string, IconCollectionMeta>;
}>(CACHE_TTL_MS, CACHE_MAX_ENTRIES);
/**
 * 세트 전체 이름표. 질의와 무관하므로 셋 중 가장 오래 산다.
 *
 * 둘러보기와 오타·외래어 되짚기가 같이 쓴다 — 검색 한 번마다 3만 개를 다시 받으면
 * 안 된다.
 */
const namesCache = makeCache<string[]>(CACHE_TTL_MS, CACHE_MAX_ENTRIES);

/**
 * 세트당 한 번 배치로 마크업을 받는다. 아이콘마다 부르지 않는다.
 *
 * 응답은 `body`(SVG 조각)와 세트 기본 크기를 준다. viewBox는 `left/top/width/height`로
 * 짜는데, 아이콘이 자기 값을 덮어쓰는 경우가 있어 세트 기본값 위에 얹는다.
 * 별칭으로 요청한 이름은 `aliases[name].parent`를 따라간다.
 */
async function fetchMarkup(
  prefix: string,
  names: string[],
  signal?: AbortSignal,
): Promise<Record<string, { markup: string; viewBox: string }>> {
  const url = `${ICONIFY}/${encodeURIComponent(prefix)}.json?icons=${names
    .map(encodeURIComponent)
    .join(",")}`;
  const set = await getJson<IconifySet>(url, signal);
  const setWidth = set.width ?? 24;
  const setHeight = set.height ?? 24;

  const out: Record<string, { markup: string; viewBox: string }> = {};
  for (const name of names) {
    const parent = set.aliases?.[name]?.parent;
    const data =
      set.icons?.[name] ?? (parent ? set.icons?.[parent] : undefined);
    if (!data?.body) continue;
    const width = data.width ?? setWidth;
    const height = data.height ?? setHeight;
    const viewBox = `${data.left ?? 0} ${data.top ?? 0} ${width} ${height}`;
    out[name] = {
      viewBox,
      markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${data.body}</svg>`,
    };
  }
  return out;
}

type IconifyCollection = {
  uncategorized?: string[];
  categories?: Record<string, string[]>;
};

/**
 * 세트 하나의 **전체 아이콘 이름**. 검색어 없이 둘러볼 때 큐레이션 뒤에 붙일 것들이다.
 *
 * 세트마다 담는 자리가 다르다 — Lucide·Tabler·Phosphor는 `uncategorized`에 통으로,
 * Remix·Material Symbols는 `categories`에 갈래별로 나눠 준다. `hidden`(폐기 예정)은 안 쓴다.
 */
async function fetchNames(
  prefix: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const set = await getJson<IconifyCollection>(
    `${ICONIFY}/collection?prefix=${encodeURIComponent(prefix)}`,
    signal,
  );
  const out = [...(set.uncategorized ?? [])];
  for (const names of Object.values(set.categories ?? {})) out.push(...names);
  return out;
}

/**
 * 우리가 쓰는 세트의 **전체 이름표**. 둘러보기와 오타·외래어 되짚기가 같이 쓴다.
 *
 * 세트 하나가 죽어도 나머지로 답한다 — 검색이 통째로 실패하는 것보다 낫다.
 */
async function allNames(
  prefixes: readonly string[],
  signal?: AbortSignal,
): Promise<string[]> {
  const key = prefixes.join(",");
  const cached = namesCache.read(key);
  if (cached) return cached;
  const lists = await Promise.all(
    prefixes.map(async (prefix) => {
      try {
        return (await fetchNames(prefix, signal)).map(
          (name) => `${prefix}:${name}`,
        );
      } catch {
        return [] as string[];
      }
    }),
  );
  const flat = lists.flat();
  if (flat.length) namesCache.write(key, flat);
  return flat;
}

/**
 * 등급이 높은 무리부터 차례로 순위를 매겨 이어 붙인다.
 *
 * 무리마다 따로 `rankIcons`를 태우는 것이 핵심이다. 한꺼번에 태우면 세트 인터리브가
 * **등급을 가로질러 섞어서** 정확히 맞은 것 사이사이에 "비슷한 것"이 끼어든다.
 * 개념 접기는 무리를 넘어서도 이어진다 — 위 등급이 이미 가져간 개념은 안 되풀이한다.
 */
function rankByTier(
  tiers: ReadonlyArray<readonly string[]>,
  options: {
    collections: Record<string, IconCollectionMeta>;
    style?: IconStyle;
    order: readonly string[];
    limit: number;
  },
): IconHit[] {
  const out: IconHit[] = [];
  const seen = new Set<string>();
  for (const tier of tiers) {
    if (out.length >= options.limit) break;
    const ranked = rankIcons({
      icons: tier,
      collections: options.collections,
      style: options.style,
      order: options.order,
    });
    for (const hit of ranked) {
      if (seen.has(hit.concept)) continue;
      seen.add(hit.concept);
      out.push(hit);
      if (out.length >= options.limit) break;
    }
  }
  return out;
}

/**
 * 질의 하나가 견줄 낱말들.
 *
 * 사전이 옮겨 준 영어가 먼저다. 한글 원문도 함께 넘기는데, 사전에 없는 **외래어**를
 * 소리로 되짚는 길이 그것뿐이기 때문이다("애플" → `apl` → `apple`).
 */
async function matchTerms(
  query: string,
  userId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const terms = expandKoreanQuery(query);

  // 사전이 하나도 못 옮겼으면(한글만 남았으면) 국립국어원에 한 번 물어본다.
  // 못 받아도 그대로 간다 — 소리 되짚기가 남아 있어 결과가 조금 성길 뿐이다.
  if (hasHangul(query) && terms.every((term) => hasHangul(term))) {
    const looked = await lookupKorean(query, { userId, signal });
    const fresh = looked
      .slice(0, MAX_KEYWORDS)
      .filter((word) => !terms.includes(word));
    terms.unshift(...fresh);
  }

  if (hasHangul(query) && !terms.includes(query)) terms.push(query);
  return terms;
}

/** 관련도 순서를 지키며 두 결과를 합친다(중복 id는 앞의 것만). */
function mergeIcons(into: string[], next: readonly string[]): string[] {
  const seen = new Set(into);
  for (const id of next) {
    if (!seen.has(id)) {
      seen.add(id);
      into.push(id);
    }
  }
  return into;
}

export type IconsRouteOptions = EditorRouteOptions;

export function createIconsRoute(options: IconsRouteOptions = {}) {
  return async function GET(request: Request): Promise<Response> {
    const auth = await authorizeRequest(request, options.authorize);
    if (isResponse(auth)) return auth;
    // 아래 `rankAll`이 닫힌 함수라 좁힌 타입이 안 따라간다. 여기서 한 번 꺼내 둔다.
    const userId = auth.userId;

    const params = new URL(request.url).searchParams;
    const query = (params.get("q") ?? "").trim();
    const group: IconGroup =
      params.get("group") === "logos" ? "logos" : "icons";
    const styleParam = params.get("style");
    // 로고에는 선/채움 축이 없다 — 세트가 하나고 전부 채움이다.
    const style: IconStyle | undefined =
      group === "logos" || (styleParam !== "stroke" && styleParam !== "fill")
        ? undefined
        : styleParam;

    // 0-based. 격자 바닥에 닿을 때마다 다음 쪽을 부른다.
    const page = Math.max(
      0,
      Number.parseInt(params.get("page") ?? "0", 10) || 0,
    );

    const listKey = `${group}|${style ?? "any"}|${query}`;
    const cached = pageCache.read(`${listKey}|${page}`);
    if (cached) return json(cached);

    const prefixes = group === "logos" ? LOGO_PREFIXES : ICON_PREFIXES;
    const signal = request.signal;

    /** 질의 하나의 **전체 순위 목록**. 쪽마다 다시 만들지 않는다. */
    async function rankAll(): Promise<{
      hits: IconHit[];
      collections: Record<string, IconCollectionMeta>;
    }> {
      if (!query) {
        // 검색을 태우지 않는다. 세트 메타만 받아 라이선스 게이트를 그대로 통과시킨다.
        const collections = await getJson<Record<string, IconCollectionMeta>>(
          `${ICONIFY}/collections?prefixes=${prefixes.join(",")}`,
          signal,
        );
        // 큐레이션에도 스타일을 건다. 안 걸면 토글이 검색어 넣기 전까진 죽은 버튼이다.
        // 로고에는 큐레이션이 없다 — 어느 브랜드를 앞세울지는 우리가 정할 일이 아니다.
        const curated =
          group === "icons"
            ? rankIcons({
                icons: curatedFor(style),
                collections,
                style,
                order: prefixes,
              })
            : [];
        // 큐레이션 뒤에 세트 전량을 붙인다. 큐레이션이 다섯 쪽쯤 되니 스크롤은 그것만으로도
        // 이어지지만, 거기서 끝나면 "고른 것 밖"을 볼 길이 없다 — 한 세트가 뒤를 독점하지
        // 않게 `rankIcons`가 세트를 번갈아 뽑는다.
        const bulk = rankIcons({
          icons: await allNames(prefixes, signal),
          collections,
          style,
          order: prefixes,
          limit: MAX_ITEMS,
        });
        // 개념이 겹치면 큐레이션 쪽을 남긴다 — 고른 것이 뒤로 밀리면 안 된다.
        const picked = new Set(curated.map((hit) => hit.concept));
        return {
          collections,
          hits: [
            ...curated,
            ...bulk.filter((hit) => !picked.has(hit.concept)),
          ].slice(0, MAX_ITEMS),
        };
      }

      /**
       * 검색은 두 갈래를 합친다.
       *
       * 제공처 검색은 별칭·설명까지 보므로 `delivery`가 `truck`을 물어 오는 식으로
       * 우리가 못 하는 일을 한다. 대신 **글자가 어긋나면 0건**이다 — 오타 하나에도,
       * 사전에 없는 외래어에도 아무것도 안 준다.
       *
       * 그래서 세트 전체 이름표를 같이 놓고 우리가 직접 견준다. 두 갈래를 합친 뒤
       * 등급으로 나누므로 **정확히 맞은 것이 먼저, 비슷한 것이 그 아래**로 온다.
       */
      const terms = await matchTerms(query, userId, signal);
      // 사전이 못 옮긴 한글은 제공처에 넘겨 봐야 0건이다 — 그 왕복을 건너뛴다.
      const keywords = terms
        .filter((term) => !hasHangul(term))
        .slice(0, MAX_KEYWORDS);

      // 세트 메타는 이름표를 거르는 데 필요하다. 못 받아도 검색 응답이 자기 몫은 채운다.
      let collections: Record<string, IconCollectionMeta> = {};
      try {
        collections = await getJson<Record<string, IconCollectionMeta>>(
          `${ICONIFY}/collections?prefixes=${prefixes.join(",")}`,
          signal,
        );
      } catch {
        collections = {};
      }
      const found: string[] = [];
      /** 검색이 죽은 사연. 이름표까지 비었을 때만 밖으로 던진다. */
      let searchError: unknown = null;
      for (const keyword of keywords) {
        const url = new URL(`${ICONIFY}/search`);
        url.searchParams.set("query", keyword);
        url.searchParams.set("limit", String(RAW_LIMIT));
        url.searchParams.set("prefixes", prefixes.join(","));
        try {
          const hit = await getJson<IconifySearch>(url.toString(), signal);
          mergeIcons(found, hit.icons ?? []);
          Object.assign(collections, hit.collections ?? {});
        } catch (error) {
          // 제공처 검색이 죽어도 이름표로 답할 수 있다.
          searchError = error;
        }
        // 첫 키워드로 이미 충분하면 다음은 안 태운다.
        if (found.length >= THIN_RESULT) break;
      }

      const names = await allNames(prefixes, signal);
      // 양쪽 다 빈손이면 "결과 없음"이 아니라 제공처가 죽은 것이다. 그건 알려야 한다.
      if (!found.length && !names.length && searchError) throw searchError;

      /**
       * 두 갈래를 등급으로 다시 세운다.
       *
       * 제공처가 물어 온 것은 **글자가 안 맞아도 버리지 않는다**. `delivery`로 찾은
       * `truck`처럼 별칭·설명으로 맞은 것들이라, 이름만 보고 자르면 제공처를 거치는
       * 이유가 사라진다. 그래서 정확히 맞지 않은 검색 결과도 가운데 등급에 남기고,
       * 우리가 이름표로 억지로 찾아낸 것(오타·외래어)만 맨 아래로 보낸다.
       */
      // 흐리게 견주는 것은 **사용자가 친 말**뿐이다(위 `matchTier` 주석 참고).
      const typed = [query];
      const fromSearch = tierIds(found, terms, typed);
      const fromNames = tierIds(names, terms, typed);
      const exactHit = new Set(fromSearch.exact);
      const exact = mergeIcons([...fromSearch.exact], fromNames.exact);
      const partial = mergeIcons(
        found.filter((id) => !exactHit.has(id)),
        fromNames.partial,
      );

      return {
        collections,
        hits: rankByTier([exact, partial, fromNames.fuzzy], {
          collections,
          style,
          order: prefixes,
          limit: MAX_ITEMS,
        }),
      };
    }

    try {
      const ranked = hitsCache.read(listKey) ?? (await rankAll());
      hitsCache.write(listKey, ranked);
      const { hits: allHits, collections } = ranked;

      const slice = allHits.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      const grouped = groupByPrefix(slice);
      const markupBySet = await Promise.all(
        Object.entries(grouped).map(async ([prefix, names]) => {
          try {
            return [prefix, await fetchMarkup(prefix, names, signal)] as const;
          } catch {
            // 한 세트가 죽어도 나머지는 보여 준다.
            return [prefix, {}] as const;
          }
        }),
      );
      const markup = Object.fromEntries(markupBySet);

      const items: IconItem[] = [];
      for (const hit of slice) {
        const found = markup[hit.prefix]?.[hit.name];
        if (!found) continue;
        items.push({
          id: hit.id,
          style: hit.style,
          markup: found.markup,
          viewBox: found.viewBox,
          setName: collections[hit.prefix]?.name ?? hit.prefix,
          license: collections[hit.prefix]?.license?.spdx ?? "",
        });
      }

      const body: IconSearchResponse = {
        items,
        group,
        page,
        hasMore: (page + 1) * PAGE_SIZE < allHits.length,
        // 상한에서 잘렸다는 뜻. 조용히 자르면 "이게 전부"로 읽힌다.
        truncated: allHits.length >= MAX_ITEMS,
      };
      pageCache.write(`${listKey}|${page}`, body);
      return json(body);
    } catch (error) {
      if (signal.aborted) return new Response(null, { status: 499 });
      options.onError?.(error, { route: "icons", query, group, style, page });
      return json({ error: "icon-search-failed" }, 502);
    }
  };
}

/**
 * 설정 없이 그대로 마운트할 때. 인증을 걸려면 `createIconsRoute` 를 쓴다.
 *
 * 게이트 없이 열어 두어도 되는 이유는 상류가 공개 API 고 우리 키를 안 태우기 때문이다.
 * 국립국어원 확장만 사용자별 하루 몫을 쓰는데, 인증이 없으면 그 몫이 `"anonymous"` 하나로
 * 모여 금방 소진된다 — 확장이 꺼질 뿐 검색은 계속 된다.
 */
export const GET = createIconsRoute();
