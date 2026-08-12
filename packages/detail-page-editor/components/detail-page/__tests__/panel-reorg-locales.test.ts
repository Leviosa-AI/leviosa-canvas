import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 이번 주기에서 새로 생긴 문구 — 좌측 "요소" 탭과 우측 "배경 지우기(누끼)".
 *
 * 번역을 빠뜨리면 화면에 ``detailPage.sidebar.elements`` 같은 키가 그대로 뜬다.
 * 한국어로 쓰는 동안에는 영어 쪽 누락이 눈에 안 띄므로 여기서 못 박는다.
 */

const KEYS = [
  // 좌측 레일: 도형·차트·표를 접어 넣은 탭. 그룹 라벨은 기존 shapes/charts/tables
  // 키를 그대로 재사용하므로(같은 단어) 여기서는 새 키만 본다.
  "detailPage.sidebar.elements",
  // 우측 인스펙터: 누끼.
  ...[
    "bgRemove",
    "bgRemoveRun",
    "bgRemoveBusy",
    "bgRemoveHint",
    "bgRemoveFailed",
  ].map((k) => `detailPage.properties.${k}`),
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
