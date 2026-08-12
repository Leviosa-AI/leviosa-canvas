import { describe, expect, it } from "vitest";

import {
  ALLOWED_ICON_SPDX,
  conceptOf,
  groupByPrefix,
  iconStyleOf,
  interleaveBySet,
  isAllowedCollection,
  parseIconId,
  rankIcons,
  type IconCollectionMeta,
} from "../icon-search";

/** 2026-08-10 실측 응답에서 추린 세트 메타. */
const COLLECTIONS: Record<string, IconCollectionMeta> = {
  lucide: {
    name: "Lucide",
    license: { spdx: "ISC" },
    tags: ["Precise Shapes", "Has Padding", "Uses Stroke"],
    palette: false,
  },
  tabler: {
    name: "Tabler Icons",
    license: { spdx: "MIT" },
    tags: ["Precise Shapes", "Has Padding", "Uses Stroke"],
    palette: false,
  },
  ph: { name: "Phosphor", license: { spdx: "MIT" }, tags: ["Uses Stroke"], palette: false },
  "material-symbols": {
    name: "Material Symbols",
    license: { spdx: "Apache-2.0" },
    tags: ["Has Padding"],
    palette: false,
  },
  "fa6-solid": { name: "Font Awesome Solid", license: { spdx: "CC-BY-4.0" }, palette: false },
  twemoji: { name: "Twemoji", license: { spdx: "MIT" }, palette: true },
};

const ORDER = ["lucide", "tabler", "ph", "material-symbols"];

describe("parseIconId", () => {
  it("접두사와 이름으로 가른다", () => {
    expect(parseIconId("tabler:truck")).toEqual({ prefix: "tabler", name: "truck" });
  });

  it("이름에 하이픈이 있어도 첫 콜론에서만 자른다", () => {
    expect(parseIconId("material-symbols:local-shipping")).toEqual({
      prefix: "material-symbols",
      name: "local-shipping",
    });
  });

  it("콜론이 없거나 한쪽이 비면 버린다", () => {
    expect(parseIconId("truck")).toBeNull();
    expect(parseIconId(":truck")).toBeNull();
    expect(parseIconId("tabler:")).toBeNull();
  });
});

describe("conceptOf", () => {
  it("변형 접미사를 뗀다", () => {
    expect(conceptOf("truck-fill")).toBe("truck");
    expect(conceptOf("truck-filled")).toBe("truck");
    expect(conceptOf("check-line")).toBe("check");
  });

  it("중첩된 접미사도 끝까지 뗀다", () => {
    expect(conceptOf("desktop-access-disabled-outline-sharp")).toBe(
      "desktop-access-disabled",
    );
  });

  it("접미사가 없으면 그대로 둔다", () => {
    expect(conceptOf("truck-delivery")).toBe("truck-delivery");
  });

  it("통째로 접미사인 이름은 지운다 — 그런 아이콘이 실제로 있다", () => {
    expect(conceptOf("line")).toBe("line");
    expect(conceptOf("fill")).toBe("fill");
  });
});

describe("iconStyleOf", () => {
  it("이름 접미사가 세트 성격보다 우선한다", () => {
    // Phosphor는 세트 태그가 "Uses Stroke"지만 -fill 변형은 채움이다.
    expect(iconStyleOf("truck-fill", COLLECTIONS.ph)).toBe("fill");
    expect(iconStyleOf("truck-thin", COLLECTIONS.ph)).toBe("stroke");
  });

  it("접미사가 없으면 세트 태그를 본다", () => {
    expect(iconStyleOf("truck", COLLECTIONS.lucide)).toBe("stroke");
    expect(iconStyleOf("local-shipping", COLLECTIONS["material-symbols"])).toBe("fill");
  });

  it("메타가 없으면 채움으로 본다", () => {
    expect(iconStyleOf("truck")).toBe("fill");
  });

  it("Material Symbols 의 -outline 은 선이다", () => {
    expect(iconStyleOf("local-shipping-outline", COLLECTIONS["material-symbols"])).toBe(
      "stroke",
    );
  });
});

describe("isAllowedCollection", () => {
  it("허용 SPDX 만 통과시킨다", () => {
    expect(isAllowedCollection(COLLECTIONS.lucide)).toBe(true);
    expect(isAllowedCollection(COLLECTIONS["material-symbols"])).toBe(true);
  });

  it("CC BY 는 막는다 — 결과물에 출처를 박을 자리가 없다", () => {
    expect(isAllowedCollection(COLLECTIONS["fa6-solid"])).toBe(false);
    expect(ALLOWED_ICON_SPDX).not.toContain("CC-BY-4.0");
  });

  it("색이 구워진 세트는 라이선스와 무관하게 막는다", () => {
    expect(isAllowedCollection(COLLECTIONS.twemoji)).toBe(false);
  });

  it("메타나 라이선스가 없으면 막는다", () => {
    expect(isAllowedCollection(undefined)).toBe(false);
    expect(isAllowedCollection({ name: "X" })).toBe(false);
  });
});

describe("interleaveBySet", () => {
  it("세트별로 돌아가며 뽑는다", () => {
    const items = [
      { prefix: "a", id: "a1" },
      { prefix: "a", id: "a2" },
      { prefix: "b", id: "b1" },
      { prefix: "c", id: "c1" },
    ];
    expect(interleaveBySet(items, ["a", "b", "c"]).map((i) => i.id)).toEqual([
      "a1",
      "b1",
      "c1",
      "a2",
    ]);
  });

  it("세트 안의 순서는 지킨다", () => {
    const items = [
      { prefix: "a", id: "a1" },
      { prefix: "a", id: "a2" },
      { prefix: "a", id: "a3" },
    ];
    expect(interleaveBySet(items).map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
  });

  it("우선순위에 없는 세트는 뒤로 민다", () => {
    const items = [
      { prefix: "z", id: "z1" },
      { prefix: "a", id: "a1" },
    ];
    expect(interleaveBySet(items, ["a"]).map((i) => i.id)).toEqual(["a1", "z1"]);
  });

  it("하나도 안 잃는다", () => {
    const items = Array.from({ length: 17 }, (_, i) => ({
      prefix: ["a", "b", "c"][i % 3],
      id: String(i),
    }));
    expect(interleaveBySet(items, ["a", "b", "c"])).toHaveLength(17);
  });
});

describe("rankIcons", () => {
  // 실측: /search?query=truck&prefixes=lucide,tabler,ph 응답의 앞부분.
  const ICONS = [
    "tabler:truck",
    "tabler:truck-filled",
    "lucide:truck",
    "ph:truck",
    "ph:truck-bold",
    "ph:truck-duotone",
    "ph:truck-fill",
    "ph:truck-light",
    "ph:truck-thin",
    "tabler:rv-truck",
    "tabler:truck-off",
    "tabler:truck-delivery",
  ];

  it("같은 개념은 대표 하나로 접는다", () => {
    const hits = rankIcons({ icons: ICONS, collections: COLLECTIONS, order: ORDER });
    const concepts = hits.map((h) => h.concept);
    expect(new Set(concepts).size).toBe(concepts.length);
    expect(concepts).toContain("truck");
    expect(concepts).toContain("truck-delivery");
  });

  it("접기보다 섞기를 먼저 해서 한 세트가 대표를 독식하지 못한다", () => {
    const hits = rankIcons({ icons: ICONS, collections: COLLECTIONS, order: ORDER });
    // lucide 가 우선순위 1위라 "truck" 대표를 가져간다.
    expect(hits[0].id).toBe("lucide:truck");
    // 그런데도 나머지 개념은 다른 세트에서 나온다.
    expect(new Set(hits.map((h) => h.prefix)).size).toBeGreaterThan(1);
  });

  it("스타일 축으로 거른다", () => {
    const stroke = rankIcons({
      icons: ICONS,
      collections: COLLECTIONS,
      style: "stroke",
      order: ORDER,
    });
    expect(stroke.every((h) => h.style === "stroke")).toBe(true);
    expect(stroke.map((h) => h.id)).not.toContain("tabler:truck-filled");

    const fill = rankIcons({
      icons: ICONS,
      collections: COLLECTIONS,
      style: "fill",
      order: ORDER,
    });
    expect(fill.every((h) => h.style === "fill")).toBe(true);
    expect(fill.length).toBeGreaterThan(0);
  });

  it("허용 안 된 세트는 결과에서 사라진다", () => {
    const hits = rankIcons({
      icons: ["fa6-solid:truck", "twemoji:truck", "lucide:truck"],
      collections: COLLECTIONS,
      order: ORDER,
    });
    expect(hits.map((h) => h.id)).toEqual(["lucide:truck"]);
  });

  it("모르는 접두사는 조용히 버린다", () => {
    const hits = rankIcons({
      icons: ["nope:truck", "lucide:truck"],
      collections: COLLECTIONS,
    });
    expect(hits.map((h) => h.id)).toEqual(["lucide:truck"]);
  });

  it("limit 을 지킨다", () => {
    const hits = rankIcons({
      icons: ICONS,
      collections: COLLECTIONS,
      order: ORDER,
      limit: 2,
    });
    expect(hits).toHaveLength(2);
  });

  it("빈 입력에 빈 배열", () => {
    expect(rankIcons({ icons: [], collections: COLLECTIONS })).toEqual([]);
  });
});

describe("groupByPrefix", () => {
  it("마크업을 세트당 한 번에 받게 묶는다", () => {
    const hits = rankIcons({
      icons: ["lucide:truck", "tabler:truck-delivery", "lucide:check"],
      collections: COLLECTIONS,
      order: ORDER,
    });
    expect(groupByPrefix(hits)).toEqual({
      lucide: ["truck", "check"],
      tabler: ["truck-delivery"],
    });
  });
});
