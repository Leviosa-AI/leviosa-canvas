import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TABLE_PRESETS } from "../../../lib/detail-page/table/defaults";

/**
 * 표 문구도 카탈로그(코드)와 번역 파일 두 곳에 나뉘어 산다.
 *
 * 프리셋을 하나 추가하면서 번역을 빠뜨리면 패널에 ``detailPage.table.…`` 키가 그대로
 * 뜬다. 한국어로 쓰는 동안에는 눈에 잘 안 띄므로 여기서 못 박는다.
 */

const KEYS = [
  "detailPage.sidebar.tables",
  "detailPage.table.panelTitle",
  "detailPage.table.panelHint",
  "detailPage.table.insertHint",
  "detailPage.table.typeTable",
  "detailPage.table.kind",
  "detailPage.table.data",
  "detailPage.table.layout",
  "detailPage.table.lines",
  "detailPage.table.colors",
  "detailPage.table.type",
  "detailPage.table.addRow",
  "detailPage.table.addColumn",
  "detailPage.table.removeRow",
  "detailPage.table.removeColumn",
  "detailPage.table.pasteHint",
  "detailPage.table.detach",
  "detailPage.table.detachAction",
  "detailPage.table.detachHint",
  "detailPage.table.topRule",
  "detailPage.table.rowRule",
  "detailPage.table.columnRule",
  "detailPage.table.outerBorder",
  "detailPage.table.firstFill",
  "detailPage.table.firstWidth",
  "detailPage.table.headerRow",
  "detailPage.table.zebra",
  ...["keyvalue", "grid"].map((kind) => `detailPage.table.kinds.${kind}`),
  ...["left", "center", "right"].map((a) => `detailPage.table.aligns.${a}`),
  ...TABLE_PRESETS.map((preset) => preset.labelKey),
  // 차트·표 공용 프롬프트 편집(둘 다 이 문구를 쓴다).
  "detailPage.specPromptEdit.section",
  "detailPage.specPromptEdit.success",
  "detailPage.specPromptEdit.hint",
  "detailPage.specPromptEdit.placeholder.chart",
  "detailPage.specPromptEdit.placeholder.table",
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
