import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import ko from "../ko.json";
import en from "../en.json";
import { registerDetailPageEditorTranslations } from "../index";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * 번들이 소스와 같이 움직이는지 잰다.
 *
 * 문구가 프론트엔드 `public/locales` 에 살던 시절에는 이 검사가 소비자 쪽에 있었고,
 * 패키지만 설치한 소비자는 아무 경고 없이 키를 눈으로 봤다. 이제 문구가 여기 있으니
 * 검사도 여기 있어야 한다.
 *
 * 키를 새로 부르면서 번들에 안 넣으면 여기서 죽는다. 단, `defaultValue` 를 단 자리는
 * 봐준다 — 그건 "번역 없이도 글자가 나온다"는 선언이다.
 */
function callSites(): Array<{ key: string; hasDefault: boolean; dynamic: boolean }> {
  // 한 줄로는 안 잡힌다. t("...", { \n defaultValue: ... }) 가 흔해서 파일 전체를 본다.
  const files = execFileSync(
    "grep",
    ["-rl", "-E", "\\bt\\(", PKG, "--exclude-dir=__tests__", "--exclude-dir=i18n"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);

  const out: Array<{ key: string; hasDefault: boolean; dynamic: boolean }> = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    // 키 뒤 400자 안에 defaultValue 가 있으면 기본값을 단 자리로 본다.
    const re = /\bt\(\s*([`"])([a-zA-Z0-9_.]+)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const dynamic = match[1] === "`";
      const window = text.slice(match.index, match.index + 400);
      out.push({
        key: match[2].replace(/\.$/, ""),
        hasDefault: /defaultValue\s*:/.test(window),
        dynamic,
      });
    }
  }
  return out;
}

function lookup(root: unknown, key: string): unknown {
  let cur = root;
  for (const part of key.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * 동적 키(`detailPage.properties.weight${w}`)는 뿌리 자체가 노드가 아니다. 그 자리에는
 * `weight300` 같은 형제들이 있으므로, 뿌리로 시작하는 키가 하나라도 있으면 채워진 것으로 본다.
 */
function has(bundle: Record<string, unknown>, key: string, dynamic = false): boolean {
  for (const ns of Object.values(bundle)) {
    if (lookup(ns, key) !== undefined) return true;
    if (!dynamic) continue;
    const parts = key.split(".");
    const leaf = parts.pop()!;
    const parent = lookup(ns, parts.join("."));
    if (parent && typeof parent === "object") {
      if (Object.keys(parent).some((name) => name.startsWith(leaf))) return true;
    }
  }
  return false;
}

describe("편집기 번들", () => {
  const sites = callSites();

  it("소스가 부르는 키를 다 들고 있다", () => {
    expect(sites.length).toBeGreaterThan(300);
    const orphans = sites
      .filter((site) => !site.hasDefault && !has(ko, site.key, site.dynamic))
      .map((site) => site.key);
    expect([...new Set(orphans)]).toEqual([]);
  });

  it("한국어와 영어가 같은 자리를 채운다", () => {
    // 한쪽에만 있는 키는 언어를 바꾼 순간 키가 그대로 보인다.
    const onlyKo = sites.filter((site) => has(ko, site.key, site.dynamic) && !has(en, site.key, site.dynamic));
    expect(onlyKo.map((site) => site.key)).toEqual([]);
  });

  it("소비자 값을 덮어쓰지 않는다", () => {
    const calls: Array<[string, string, boolean, boolean]> = [];
    registerDetailPageEditorTranslations({
      addResourceBundle: (lng, ns, _resources, deep, overwrite) => {
        calls.push([lng, ns, deep!, overwrite!]);
      },
    });
    expect(calls.length).toBeGreaterThan(0);
    // deep 이 아니면 소비자의 형제 키가 통째로 날아가고, overwrite 면 값이 밀린다.
    for (const [, , deep, overwrite] of calls) {
      expect(deep).toBe(true);
      expect(overwrite).toBe(false);
    }
  });
});
