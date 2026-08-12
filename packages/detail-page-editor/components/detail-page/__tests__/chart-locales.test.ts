import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CHART_PRESETS } from "../../../lib/detail-page/chart/defaults";
import { CHART_KINDS } from "../../../lib/detail-page/chart/render";

/**
 * 차트 문구도 카탈로그(코드)와 번역 파일 두 곳에 나뉘어 산다.
 *
 * 프리셋이나 종류를 하나 추가하면서 번역을 빠뜨리면 패널에 ``detailPage.chart.…`` 키가
 * 그대로 뜬다. 한국어로 쓰는 동안에는 눈에 잘 안 띄므로 여기서 못 박는다.
 */

const KEYS = [
  "detailPage.sidebar.charts",
  "detailPage.chart.panelTitle",
  "detailPage.chart.panelHint",
  "detailPage.chart.insertHint",
  "detailPage.chart.typeChart",
  "detailPage.chart.kind",
  "detailPage.chart.data",
  "detailPage.chart.display",
  "detailPage.chart.colors",
  "detailPage.chart.shape",
  "detailPage.chart.addRow",
  "detailPage.chart.removeRow",
  "detailPage.chart.pasteHint",
  "detailPage.chart.detach",
  "detailPage.chart.detachHint",
  "detailPage.chart.highlightNone",
  ...CHART_KINDS.map((kind) => `detailPage.chart.kinds.${kind}`),
  ...CHART_PRESETS.map((preset) => preset.labelKey),
  ...["none", "desc", "asc"].map((sort) => `detailPage.chart.sorts.${sort}`),
  ...["accent", "muted", "track", "label", "value"].map(
    (slot) => `detailPage.chart.color.${slot}`,
  ),
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
