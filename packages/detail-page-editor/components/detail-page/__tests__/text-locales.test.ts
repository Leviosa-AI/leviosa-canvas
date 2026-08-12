import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TEXT_PRESETS } from "../../../lib/detail-page/text-presets";

/**
 * "텍스트" 패널 문구.
 *
 * 프리셋 문구는 카탈로그(코드)와 번역 파일 두 곳에 나뉘어 산다. 프리셋에 줄을 하나
 * 더하면서 번역을 빠뜨리면 캔버스에 `detailPage.textPresets.…` 키가 **글자 그대로
 * 박힌 채로** 들어간다 — 미리보기에서도 똑같이 보이므로 눈으로는 놓치기 쉽다.
 */

const KEYS = [
  "detailPage.text.heading",
  "detailPage.text.subheading",
  "detailPage.text.body",
  "detailPage.text.caption",
  "detailPage.text.hint",
  "detailPage.textPresets.title",
  ...TEXT_PRESETS.flatMap((preset) => [
    `detailPage.textPresets.${preset.key}.name`,
    ...preset.nodes.map(
      (node) => `detailPage.textPresets.${preset.key}.${node.key}`,
    ),
  ]),
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
