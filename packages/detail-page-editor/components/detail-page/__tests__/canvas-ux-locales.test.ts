import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 캔버스 사용감 기능(우클릭 메뉴 · 서식 복사 · 찾기 바꾸기 · 균등 배분)의 문구.
 *
 * 항목을 하나 늘리면서 번역을 빠뜨리면 메뉴에 ``detailPage.canvasMenu.…`` 키가 그대로
 * 뜬다. 한국어로 쓰는 동안에는 눈에 잘 안 띄므로 여기서 못 박는다.
 */

const KEYS = [
  ...[
    "duplicate",
    "lock",
    "unlock",
    "delete",
    "copyFormat",
    "pasteFormat",
    "front",
    "forward",
    "backward",
    "back",
    "group",
    "ungroup",
  ].map((a) => `detailPage.canvasMenu.${a}`),
  ...[
    "title",
    "close",
    "findPlaceholder",
    "replacePlaceholder",
    "caseSensitive",
    "previous",
    "next",
    "replace",
    "replaceAll",
    "count",
    "none",
    "idle",
    "chartHint",
  ].map((k) => `detailPage.findReplace.${k}`),
  // 간격 고르게(distribute) — 정렬 컨트롤 옆.
  "detailPage.properties.spreadH",
  "detailPage.properties.spreadV",
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
