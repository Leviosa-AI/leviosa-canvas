import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GIF_EFFECT_LABEL_KEYS } from "../detail-page-properties-panel";

/**
 * 이펙트 문구는 카탈로그(코드)와 번역 파일 두 곳에 나뉘어 산다.
 *
 * 이펙트를 하나 추가하면서 번역을 빠뜨리면 화면에 `detailPage.gifEffects.…` 같은
 * 키가 그대로 노출된다 — 눈으로는 잘 안 걸리고, 한국어로 쓰는 동안에는 아예 안 보인다.
 * 그래서 카탈로그가 쓰는 키가 ko/en 양쪽에 다 있는지 여기서 못 박는다.
 */

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

  it.each(GIF_EFFECT_LABEL_KEYS)("%s 가 비어 있지 않다", (key) => {
    const value = lookup(tree, key);
    expect(typeof value).toBe("string");
    expect(String(value).trim()).not.toBe("");
  });
});

describe("en 번역", () => {
  it("한국어가 남아 있지 않다", () => {
    const tree = locale("en");
    const korean = GIF_EFFECT_LABEL_KEYS.filter((key) =>
      /[가-힣]/.test(String(lookup(tree, key) ?? "")),
    );
    expect(korean).toEqual([]);
  });
});
