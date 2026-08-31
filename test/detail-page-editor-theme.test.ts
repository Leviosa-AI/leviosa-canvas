import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 편집기 크롬의 색·모서리·굵기는 토큰으로만 적는다.
 *
 * 소비자가 편집기를 자기 디자인으로 갈아입힐 수 있는 것은 이 규칙 하나에 달려 있다.
 * `border-neutral-200` 한 줄이 새로 들어오면 그 자리만 회색으로 남고, 갈아입힌 화면에
 * 원래 팔레트가 비어져 나온다 — 그리고 그건 아무도 안 알려 준다.
 *
 * 값은 `styles/tokens.css` 가 들고 있고 기본값은 예전 색 그대로다. 그러니 이 규칙을
 * 지키는 비용은 "이름을 바꿔 적는 것" 뿐이다.
 */

/**
 * shadcn 원본이 달고 오는 의미 이름들. 팔레트 이름(`neutral-200`)과 달리 이쪽은
 * **소비자 앱의 CSS 변수**를 읽는다 — 그 앱이 값을 안 두면 Tailwind 가 클래스를 아예
 * 안 굽고(판이 투명해진다), 두더라도 그 앱의 값이지 편집기가 정한 값이 아니다.
 * 둘 다 조용히 망가지는 쪽이라 눈으로는 안 잡힌다.
 */
const HOST_NAMES =
  "primary|secondary|accent|muted|popover|card|destructive|background|foreground|border|input|ring";

const PALETTE =
  "neutral|gray|zinc|slate|stone|white|black|red|blue|emerald|amber|indigo|violet|sky|green|orange|rose|purple|yellow|teal|cyan|lime|pink|fuchsia";
const UTIL =
  "bg|text|border|ring|divide|placeholder|from|to|via|fill|stroke|outline|decoration|accent|caret";

function editorSources(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "packages/detail-page-editor/components/**/*.tsx"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((path) => path && !path.includes("__tests__"));
}

/** 주석은 규칙을 설명하느라 금지된 이름을 그대로 적는다 — 검사에서 뺀다. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("편집기 크롬 토큰", () => {
  it("원본 팔레트 클래스를 직접 쓰지 않는다", () => {
    const offenders: string[] = [];
    const pattern = new RegExp(`\\b(?:${UTIL})-(?:${PALETTE})(?:-\\d{1,3})?\\b`, "g");
    for (const path of editorSources()) {
      const hits = readFileSync(path, "utf8").match(pattern);
      if (hits) offenders.push(`${path}: ${[...new Set(hits)].join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("소비자 앱의 팔레트 이름을 빌려 쓰지 않는다", () => {
    // 이 규칙이 없어서 두 번 샜다. 글꼴 목록은 `bg-accent`(agency 에서 먹)로 행이
    // 새까매졌고(#31), 다운로드 팝오버는 `bg-popover`(agency 에 없음)로 목록 판이
    // 투명해지고 `text-primary-foreground`(없음)로 저장 버튼 글자가 배경과 같은
    // 색이 됐다. 한 파일씩 고치는 대신 이름 자체를 여기서 막는다.
    const offenders: string[] = [];
    // 앞의 `(?<![-[\\w])` 는 `text-[var(--color-text-secondary)]` 같은 임의값 안의
    // 조각을 이름으로 잘못 읽지 않게 한다.
    const pattern = new RegExp(
      `(?<![-[\\w])(?:${UTIL})-(?:${HOST_NAMES})(?:-foreground)?(?:/\\d{1,3})?\\b`,
      "g",
    );
    for (const path of editorSources()) {
      const hits = withoutComments(readFileSync(path, "utf8")).match(pattern);
      if (hits) offenders.push(`${path}: ${[...new Set(hits)].join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("모서리·굵기도 토큰으로 적는다", () => {
    // `rounded-full` 은 알약·아바타라는 뜻이라 토큰이 아니다 — 값이 아니라 모양이다.
    const offenders: string[] = [];
    const pattern =
      /\b(?:rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|es|ee))?-(?:sm|md|lg|xl)|font-(?:normal|medium|semibold|bold))\b/g;
    for (const path of editorSources()) {
      const hits = readFileSync(path, "utf8").match(pattern);
      if (hits) offenders.push(`${path}: ${[...new Set(hits)].join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("쓰는 토큰은 모두 tokens.css 에 있다", () => {
    // 없는 토큰을 부르면 Tailwind 는 그 클래스를 아예 안 굽는다. 빌드는 통과하고
    // 그 자리만 색이 빠진다.
    const css = readFileSync(
      "packages/detail-page-editor/styles/tokens.css",
      "utf8",
    );
    const defined = new Set(
      [...css.matchAll(/--((?:color|radius|font-weight)-dpe-[a-z0-9-]+):/g)].map(
        (m) => m[1],
      ),
    );

    const missing = new Set<string>();
    for (const path of editorSources()) {
      const source = readFileSync(path, "utf8");
      for (const [, util, name] of source.matchAll(
        new RegExp(`\\b(${UTIL})-(dpe-[a-z0-9-]+)(?:/\\d{1,3})?\\b`, "g"),
      )) {
        void util;
        if (!defined.has(`color-${name}`)) missing.add(`color-${name}`);
      }
      for (const [, name] of source.matchAll(
        /\brounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|es|ee))?-(dpe-(?:sm|md|lg|xl))\b/g,
      )) {
        if (!defined.has(`radius-${name}`)) missing.add(`radius-${name}`);
      }
      for (const [, name] of source.matchAll(
        /\bfont-(dpe-(?:normal|medium|semibold|bold))\b/g,
      )) {
        if (!defined.has(`font-weight-${name}`)) missing.add(`font-weight-${name}`);
      }
    }

    expect([...missing]).toEqual([]);
  });

  it("패키지가 tokens.css 를 실제로 내보낸다", () => {
    // 소비자는 `@import "@leviosa-ai/detail-page-editor/tokens.css"` 로 부른다.
    // exports 나 files 에서 빠지면 설치본에는 그 파일이 없다.
    const pkg = JSON.parse(
      readFileSync("packages/detail-page-editor/package.json", "utf8"),
    );
    expect(pkg.exports["./tokens.css"]).toBe("./styles/tokens.css");
    expect(pkg.files).toContain("styles");
  });
});
