import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 이번 주기에서 새로 생긴 문구 — 아이콘 검색 · QR · 최근/즐겨찾기 · SVG 색 · 페이지 배경.
 *
 * 번역을 빠뜨리면 화면에 ``detailPage.icons.searchLabel`` 같은 키가 그대로 뜬다.
 * 한국어로 쓰는 동안에는 영어 쪽 누락이 눈에 안 띄므로 여기서 못 박는다.
 */

const KEYS = [
  ...["icons", "qr"].map((k) => `detailPage.sidebar.${k}`),
  ...[
    "searchPlaceholder",
    "searchLabel",
    "groupLabel",
    "groupIcons",
    "groupLogos",
    "styleLabel",
    "styleStroke",
    "styleFill",
    "logoTrademark",
    "failed",
    "empty",
    "truncated",
    "licenseHint",
  ].map((k) => `detailPage.icons.${k}`),
  ...[
    "kindLabel",
    "kindQr",
    "kindEan",
    "valueLabel",
    "valuePlaceholder",
    "eanLabel",
    "eanPlaceholder",
    "qrInvalid",
    "eanInvalid",
    "foreground",
    "background",
    "previewAlt",
    "previewEmpty",
    "insert",
    "hint",
  ].map((k) => `detailPage.qr.${k}`),
  ...["title", "pin", "unpin"].map((k) => `detailPage.recents.${k}`),
  ...["shapeColors", "shapeColorsReset"].map((k) => `detailPage.properties.${k}`),
  "detailPage.pages.background",
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
