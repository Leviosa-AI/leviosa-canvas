import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * "사진" 패널 문구.
 *
 * 출처 표기(`stockCredit`)는 문구가 아니라 **이용 조건**이다 — 제공처는 검색 결과를
 * 보여줄 때 자기 이름이 걸린 링크를 요구한다. 번역하다 이름이 빠지면 조건을 어기게
 * 되므로 여기서 못 박는다.
 */

const KEYS = [
  "detailPage.photos.upload",
  "detailPage.photos.uploadFailed",
  "detailPage.photos.hint",
  "detailPage.photos.searchLabel",
  "detailPage.photos.searchPlaceholder",
  "detailPage.photos.stockInsertHint",
  "detailPage.photos.stockMore",
  "detailPage.photos.stockEmpty",
  "detailPage.photos.stockFailed",
  "detailPage.photos.stockInsertFailed",
  "detailPage.photos.stockUnavailable",
  "detailPage.photos.stockCredit",
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

  it("출처 표기에 제공처 이름이 들어 있다", () => {
    expect(String(lookup(tree, "detailPage.photos.stockCredit"))).toContain(
      "Pexels",
    );
  });
});
