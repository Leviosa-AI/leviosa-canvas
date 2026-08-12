/**
 * 아이콘 검색 결과를 그리드에 뿌릴 수 있는 모양으로 다듬는 순수 함수들.
 *
 * 제공처(Iconify)가 돌려주는 것은 `"tabler:truck"` 같은 **문자열 배열**과 세트별 메타뿐이다.
 * 그대로 뿌리면 세 가지가 깨진다.
 *
 *  1. 개수가 큰 세트가 격자를 독점한다(`material-symbols` 혼자 15,585개다).
 *  2. 같은 개념이 변형 이름으로 도배된다 — "truck" 28건 중 `ph:truck-*`만 5건이다.
 *  3. 선 아이콘과 채움 아이콘이 뒤섞여 상세페이지에 넣으면 바로 티가 난다.
 *
 * 그래서 **스타일로 거르고 → 세트를 섞고 → 같은 개념을 접는다.** 이 순서가 중요하다.
 * 접기를 먼저 하면 한 세트가 대표를 다 가져간다.
 *
 * 라이선스 판정도 여기 있다. 세트 이름 목록을 손으로 관리하지 않고 제공처가 주는
 * `license.spdx`를 본다 — 상류가 바뀌어도 무단 자산이 통과하지 못한다.
 */

export type IconStyle = "stroke" | "fill";

/** 제공처의 세트 메타 중 우리가 쓰는 부분만. */
export type IconCollectionMeta = {
  name?: string;
  license?: { title?: string; spdx?: string; url?: string };
  /** true면 색이 구워져 있다(Twemoji 등) — 브랜드 색 치환이 안 먹는다. */
  palette?: boolean;
  tags?: string[];
  category?: string;
};

export type IconHit = {
  /** `"tabler:truck"` — 제공처 식별자 그대로. */
  id: string;
  prefix: string;
  name: string;
  /** 변형 접미사를 뗀 개념 이름. 접기 기준이다. */
  concept: string;
  style: IconStyle;
};

/**
 * 제공처가 **표기를 지키기만 하면** 결과물에 출처를 안 박아도 되는 것들.
 *
 * CC BY(예: Font Awesome Free)는 뺐다. 아이콘은 고객 상세페이지에 그대로 박히는
 * 결과물이라 저작자 표시를 붙일 자리가 없다 — 패널 하단 링크로 되는 스톡 사진과 다르다.
 */
export const ALLOWED_ICON_SPDX: readonly string[] = [
  "MIT",
  "ISC",
  "Apache-2.0",
  "CC0-1.0",
  "Unlicense",
];

/**
 * 이름 끝에 붙는 변형 접미사. 세트마다 표기가 다르다:
 * Phosphor `-fill/-bold/-thin/-light/-duotone`, Tabler `-filled`,
 * Remix `-line/-fill`, Material Symbols `-outline/-rounded/-sharp`(중첩된다).
 */
const VARIANT_SUFFIXES: readonly string[] = [
  "outline",
  "outlined",
  "filled",
  "fill",
  "solid",
  "line",
  "duotone",
  "twotone",
  "two-tone",
  "rounded",
  "round",
  "sharp",
  "bold",
  "light",
  "thin",
  "regular",
];

/** 접미사가 "채움"을 뜻하는 것들. 나머지는 세트 성격을 따른다. */
const FILL_SUFFIXES = new Set(["fill", "filled", "solid", "duotone", "twotone", "two-tone"]);
/** 접미사가 "선"을 뜻하는 것들. */
const STROKE_SUFFIXES = new Set(["outline", "outlined", "line", "thin", "light"]);

export function parseIconId(id: string): { prefix: string; name: string } | null {
  const colon = id.indexOf(":");
  if (colon <= 0 || colon === id.length - 1) return null;
  return { prefix: id.slice(0, colon), name: id.slice(colon + 1) };
}

/**
 * 이름에서 변형 접미사를 **모두** 떼어 개념만 남긴다.
 * `desktop-access-disabled-outline-sharp` → `desktop-access-disabled`.
 *
 * 통째로 비어 버리는 이름(`tabler:line`)은 원문을 지킨다 — 그런 아이콘이 실제로 있다.
 */
export function conceptOf(name: string): string {
  let out = name;
  for (;;) {
    const hit = VARIANT_SUFFIXES.find((suffix) => out.endsWith(`-${suffix}`));
    if (!hit) break;
    const next = out.slice(0, -(hit.length + 1));
    if (!next) break;
    out = next;
  }
  return out;
}

/** 이름에 붙은 변형 접미사 목록(뒤에서 앞으로). 없으면 빈 배열. */
function suffixesOf(name: string): string[] {
  const out: string[] = [];
  let rest = name;
  for (;;) {
    const hit = VARIANT_SUFFIXES.find((suffix) => rest.endsWith(`-${suffix}`));
    if (!hit) break;
    const next = rest.slice(0, -(hit.length + 1));
    if (!next) break;
    out.push(hit);
    rest = next;
  }
  return out;
}

/**
 * 이 아이콘이 선인지 채움인지.
 *
 * 이름의 접미사가 먼저다 — 한 세트 안에 둘 다 있는 경우가 흔하다(Phosphor, Remix).
 * 접미사가 말이 없으면 세트 메타의 `"Uses Stroke"` 태그를 본다(Lucide·Tabler가 여기 걸린다).
 */
export function iconStyleOf(name: string, meta?: IconCollectionMeta): IconStyle {
  for (const suffix of suffixesOf(name)) {
    if (FILL_SUFFIXES.has(suffix)) return "fill";
    if (STROKE_SUFFIXES.has(suffix)) return "stroke";
  }
  return meta?.tags?.includes("Uses Stroke") ? "stroke" : "fill";
}

/** 라이선스와 색 구움 여부로 세트를 통과시킬지 정한다. */
export function isAllowedCollection(
  meta: IconCollectionMeta | undefined,
  allowed: readonly string[] = ALLOWED_ICON_SPDX,
): boolean {
  if (!meta) return false;
  // 색이 구워진 세트는 브랜드 색 치환이 안 먹는다 — 라이선스와 무관하게 뺀다.
  if (meta.palette === true) return false;
  const spdx = meta.license?.spdx;
  return typeof spdx === "string" && allowed.includes(spdx);
}

/**
 * 세트별로 한 개씩 돌아가며 뽑는다. 세트 안의 순서(제공처의 관련도)는 지킨다.
 *
 * `order`를 주면 그 순서로 돈다 — 우리가 정한 세트 우선순위를 반영하는 자리다.
 * 목록에 없는 세트는 뒤에 붙는다.
 */
export function interleaveBySet<T extends { prefix: string }>(
  items: T[],
  order: readonly string[] = [],
): T[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const bucket = buckets.get(item.prefix);
    if (bucket) bucket.push(item);
    else buckets.set(item.prefix, [item]);
  }

  const prefixes = [...buckets.keys()].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === bi) return 0;
    if (ai < 0) return 1;
    if (bi < 0) return -1;
    return ai - bi;
  });

  const out: T[] = [];
  for (let round = 0; out.length < items.length; round += 1) {
    let moved = false;
    for (const prefix of prefixes) {
      const bucket = buckets.get(prefix)!;
      if (round < bucket.length) {
        out.push(bucket[round]);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

export type RankOptions = {
  /** 제공처 검색 응답의 `icons` 배열(`"prefix:name"`). 순서가 관련도다. */
  icons: readonly string[];
  /** 제공처 검색 응답의 `collections`. */
  collections: Readonly<Record<string, IconCollectionMeta>>;
  /** 보고 싶은 축. 안 주면 안 거른다. */
  style?: IconStyle;
  /** 세트 우선순위. 인터리브 순서가 된다. */
  order?: readonly string[];
  /** 허용 SPDX. 기본은 `ALLOWED_ICON_SPDX`. */
  allowedSpdx?: readonly string[];
  /** 최대 개수. */
  limit?: number;
};

/**
 * 원시 결과 → 그리드에 뿌릴 목록.
 *
 * 거르기(라이선스·스타일) → 섞기(세트 인터리브) → 접기(같은 개념 하나) 순이다.
 * 접기를 먼저 하면 목록 앞을 차지한 세트가 대표를 독식한다.
 */
export function rankIcons({
  icons,
  collections,
  style,
  order = [],
  allowedSpdx = ALLOWED_ICON_SPDX,
  limit,
}: RankOptions): IconHit[] {
  const kept: IconHit[] = [];
  for (const id of icons) {
    const parsed = parseIconId(id);
    if (!parsed) continue;
    const meta = collections[parsed.prefix];
    if (!isAllowedCollection(meta, allowedSpdx)) continue;

    const hitStyle = iconStyleOf(parsed.name, meta);
    if (style && hitStyle !== style) continue;

    kept.push({
      id,
      prefix: parsed.prefix,
      name: parsed.name,
      concept: conceptOf(parsed.name),
      style: hitStyle,
    });
  }

  const mixed = interleaveBySet(kept, order);

  const seen = new Set<string>();
  const out: IconHit[] = [];
  for (const hit of mixed) {
    if (seen.has(hit.concept)) continue;
    seen.add(hit.concept);
    out.push(hit);
    if (limit && out.length >= limit) break;
  }
  return out;
}

/** `{prefix: [name, ...]}` — 마크업을 세트당 한 번에 받기 위한 묶음. */
export function groupByPrefix(hits: readonly IconHit[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const hit of hits) {
    (out[hit.prefix] ??= []).push(hit.name);
  }
  return out;
}
