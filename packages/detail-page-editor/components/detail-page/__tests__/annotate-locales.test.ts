import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 그림으로 지시하기 · 화면 재저작의 문구.
 *
 * 컴포넌트가 ``defaultValue`` 를 들고 있어 키가 빠져도 한국어는 그대로 뜬다 — 그래서
 * 한국어로 쓰는 동안에는 누락이 **전혀** 드러나지 않고, 영어 화면에서만 한국어가
 * 튀어나온다. 여기서 못 박는다.
 */

const KEYS = [
  ...[
    "open",
    "close",
    "imageTitle",
    "imageDescription",
    "placeholder",
    "marked",
    "unmarked",
    "working",
    "flattenFailed",
    "baseUnavailable",
  ].map((k) => `detailPage.annotate.${k}`),
  ...[
    "pen",
    "rect",
    "arrow",
    "text",
    "eraser",
    "select",
    "color",
    "undo",
    "redo",
    "note",
  ].map((k) => `detailPage.annotate.tools.${k}`),
  ...[
    "title",
    "description",
    "submit",
    "failed",
    "lintWarning",
    "pageMissing",
    "referenceAdd",
    "referenceAlt",
    "referenceRemove",
    "referenceHint",
  ].map((k) => `detailPage.reauthor.${k}`),
  "detailPage.pageToolbar.reauthor",
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
