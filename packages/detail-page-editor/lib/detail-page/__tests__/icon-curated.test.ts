import { describe, expect, it } from "vitest";

import {
  CURATED_FILL,
  CURATED_STROKE,
  ICON_PREFIXES,
  curatedFor,
} from "../icon-curated";
import {
  conceptOf,
  iconStyleOf,
  parseIconId,
  rankIcons,
  type IconCollectionMeta,
} from "../icon-search";

/**
 * 큐레이션은 **손으로 늘어나는 목록**이다. 늘리다 깨지는 방식이 정해져 있어서
 * 여기서 그 세 가지를 막는다.
 *
 *  1. 우리가 안 쓰는 세트를 적으면 라이선스 게이트에서 통째로 빠진다(조용히).
 *  2. 같은 개념을 두 번 적으면 `rankIcons`가 접어 버려 개수만 줄고 화면은 그대로다.
 *  3. 스타일 축을 잘못 적으면 토글 한쪽에서만 사라진다 — 가장 늦게 발견되는 실수다.
 *
 * 이름이 실재하는지는 여기서 못 본다(제공처를 두드려야 한다). 그건 목록을 만들 때
 * 확인했고, 틀리면 그 칸만 비어 보인다.
 */

/** 세트 메타를 실제 값으로 흉내 낸다 — `Uses Stroke` 유무가 스타일 판정을 가른다. */
const META: Record<string, IconCollectionMeta> = {
  lucide: { license: { spdx: "ISC" }, tags: ["Uses Stroke"] },
  tabler: { license: { spdx: "MIT" }, tags: ["Uses Stroke"] },
  ph: { license: { spdx: "MIT" } },
  ri: { license: { spdx: "Apache-2.0" } },
  "material-symbols": { license: { spdx: "Apache-2.0" } },
};

const BOTH = [
  ["선", CURATED_STROKE, "stroke"],
  ["채움", CURATED_FILL, "fill"],
] as const;

describe("아이콘 큐레이션", () => {
  it.each(BOTH)("%s 큐레이션은 300개를 넘는다", (_label, list) => {
    // 한 쪽이 60개다. 다섯 쪽은 되어야 "둘러본다"는 말이 성립한다.
    expect(list.length).toBeGreaterThanOrEqual(300);
  });

  it.each(BOTH)("%s 큐레이션은 우리가 쓰는 세트만 적는다", (_label, list) => {
    const unknown = list.filter((id) => {
      const parsed = parseIconId(id);
      return !parsed || !ICON_PREFIXES.includes(parsed.prefix as never);
    });
    expect(unknown).toEqual([]);
  });

  it.each(BOTH)("%s 큐레이션에는 같은 개념이 두 번 없다", (_label, list) => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const id of list) {
      const concept = conceptOf(parseIconId(id)!.name);
      if (seen.has(concept)) dupes.push(id);
      seen.add(concept);
    }
    expect(dupes).toEqual([]);
  });

  it.each(BOTH)("%s 큐레이션은 전부 그 축으로 읽힌다", (_label, list, axis) => {
    const wrong = list.filter((id) => {
      const { prefix, name } = parseIconId(id)!;
      return iconStyleOf(name, META[prefix]) !== axis;
    });
    expect(wrong).toEqual([]);
  });

  it.each(BOTH)("%s 큐레이션은 순위를 태워도 하나도 안 빠진다", (_label, list, axis) => {
    // 거르기·접기를 다 통과해야 화면에 그만큼 뜬다. 라우트가 실제로 하는 계산이다.
    const ranked = rankIcons({
      icons: list,
      collections: META,
      style: axis,
      order: ICON_PREFIXES,
    });
    expect(ranked).toHaveLength(list.length);
  });

  it("토글을 안 건드리면 두 벌을 다 준다", () => {
    expect(curatedFor(undefined)).toHaveLength(CURATED_STROKE.length + CURATED_FILL.length);
    expect(curatedFor("stroke")).toBe(CURATED_STROKE);
    expect(curatedFor("fill")).toBe(CURATED_FILL);
  });

  it("두 벌은 개념을 공유한다 — 토글이 같은 그림을 다른 축으로 보여 준다", () => {
    const stroke = new Set(CURATED_STROKE.map((id) => conceptOf(parseIconId(id)!.name)));
    const shared = CURATED_FILL.filter((id) =>
      stroke.has(conceptOf(parseIconId(id)!.name)),
    );
    // 절반 넘게 겹쳐야 "같은 목록의 다른 축"이라 할 수 있다.
    expect(shared.length).toBeGreaterThan(CURATED_FILL.length / 2);
  });
});
