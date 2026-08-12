import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BASIC_SHAPES,
  NATIVE_SHAPE_IDS,
  SHAPE_CATEGORIES,
} from "../../../lib/detail-page/basic-shapes";
import { CHART_PRESETS } from "../../../lib/detail-page/chart/defaults";
import { TABLE_PRESETS } from "../../../lib/detail-page/table/defaults";

/**
 * 도형 카탈로그·장식 그룹·새 프리셋의 문구.
 *
 * 카탈로그가 70개라 하나만 빠뜨려도 격자에 `detailPage.shapes.basic.trapezoid`가
 * 그대로 뜬다. 목록을 손으로 적지 않고 **카탈로그 자체에서 뽑아** 대조한다 —
 * 도형을 추가하면 번역을 안 넣은 순간 이 테스트가 깨진다.
 */

const KEYS = [
  "detailPage.sidebar.decorations",
  "detailPage.icons.loadMore",
  "detailPage.shapes.insertHint",
  "detailPage.shapes.shapeAlt",
  "detailPage.shapes.decorationsFailed",
  "detailPage.shapes.decorationsEmpty",
  "detailPage.shapes.searchPlaceholder",
  "detailPage.shapes.searchLabel",
  "detailPage.shapes.searchEmpty",
  ...["badge", "line"].map((k) => `detailPage.shapes.decorations.${k}`),
  ...SHAPE_CATEGORIES.map((c) => `detailPage.shapes.categories.${c}`),
  ...[...NATIVE_SHAPE_IDS, ...BASIC_SHAPES.map((s) => s.id)].map(
    (id) => `detailPage.shapes.basic.${id}`,
  ),
  ...CHART_PRESETS.map((p) => p.labelKey),
  ...TABLE_PRESETS.map((p) => p.labelKey),
];

function locale(language: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), "public", "locales", language, "branding.json"),
      "utf8",
    ),
  );
}

function lookup(tree: Record<string, unknown>, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      tree,
    );
}

describe.each(["ko", "en"])("%s 번역", (language) => {
  const tree = locale(language);

  it.each(KEYS)("%s 가 비어 있지 않다", (key) => {
    const value = lookup(tree, key);
    expect(typeof value).toBe("string");
    expect(String(value).trim()).not.toBe("");
  });
});

describe("en 번역", () => {
  it("한국어가 남아 있지 않다", () => {
    const tree = locale("en");
    const korean = KEYS.filter((key) =>
      /[가-힣]/.test(String(lookup(tree, key) ?? "")),
    );
    expect(korean).toEqual([]);
  });
});

describe("카탈로그 자체", () => {
  it("id가 겹치지 않는다 — 겹치면 격자 key가 무너진다", () => {
    const ids = BASIC_SHAPES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("네이티브 셋과도 안 겹친다", () => {
    const ids = new Set(BASIC_SHAPES.map((s) => s.id));
    expect(NATIVE_SHAPE_IDS.filter((id) => ids.has(id))).toEqual([]);
  });

  it("모든 도형이 알려진 갈래에 든다", () => {
    const known = new Set<string>(SHAPE_CATEGORIES);
    expect(BASIC_SHAPES.filter((s) => !known.has(s.category))).toEqual([]);
  });

  it("viewBox가 네 숫자다", () => {
    for (const shape of BASIC_SHAPES) {
      expect(shape.viewBox, shape.id).toMatch(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/);
    }
  });
});
