/**
 * 편집기 셸의 경계.
 *
 * 이 파일은 `leviosa-frontend` 의 `shell-boundary.test.ts` 가 하던 일을 이어받는다.
 * 거기서는 "셸이 앱을 몇 군데서 부르는가"를 세며 **64 → 12** 로 줄여 왔고, 그 12건이
 * 인터페이스가 자기 계약을 적는 자리뿐이 되었을 때 셸을 여기로 옮겼다.
 *
 * 이제 셸은 앱이 없는 곳에 산다. 그래서 세는 방식이 바뀐다 — 줄여 가는 숫자가 아니라
 * **0이어야 하는 조건**이다. `@/…` 는 소비자 앱의 경로 별칭이므로, 여기서 하나라도
 * 나오면 그 파일은 소비자에서 못 선다(빌드가 아니라 소비자 쪽에서 깨진다).
 *
 * npm 의존성은 계속 목록으로 잰다. 여기 이름이 하나 늘면 소비자(agency)도 그걸 깔아야
 * 하므로, 조용히 느는 것이 곧 설치 비용이다.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PACKAGE = join(process.cwd(), "packages", "detail-page-editor");

/**
 * 셸이 쓰는 npm 패키지.
 *
 * `react-i18next` 는 peer 로 둔다 — 42개 파일이 쓰므로 주입식 `t` 로 바꾸면 그 파일을
 * 전부 건드려야 하고, 얻는 것은 소비자가 i18next 를 안 깔아도 되는 것 하나뿐이다.
 */
const ALLOWED_PACKAGES = [
  "@dnd-kit/core",
  "@dnd-kit/sortable",
  "@dnd-kit/utilities",
  "@leviosa-ai/canvas",
  "@tanstack/react-query",
  "ag-psd",
  "class-variance-authority",
  "clsx",
  "cmdk",
  "fontkit",
  "gifenc",
  "gifuct-js",
  "jszip",
  "konva",
  "lucide-react",
  "mp4-muxer",
  "next",
  "qrcode-generator",
  "radix-ui",
  "react",
  "react-dom",
  "react-i18next",
  "react-konva",
  "tailwind-merge",
  "woff2-encoder",
];

/**
 * 발행되는 것만 잰다.
 *
 * `__tests__` 는 `files` 의 제외 규칙으로 tarball 에서 빠지므로 소비자에게 도달하지
 * 않는다. 그걸 같이 세면 테스트가 쓰는 `node:child_process` 같은 것이 셸의 결합으로
 * 잡혀서, 진짜 신호가 노이즈에 묻힌다.
 */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const FILES = sourceFiles(PACKAGE);

/**
 * `from "x"` 와 `import("x")` 둘 다 센다.
 *
 * 뒤엣것을 빼면 `typeof import("…")` 같은 타입 참조가 안 잡힌다 — 런타임 결합은
 * 아니지만 소비자 쪽에서 못 푸는 것은 똑같다.
 */
const IMPORT_SPECIFIER = /(?:from|\bimport\s*\()\s*["']([^"']+)["']/g;

const appImports = new Map<string, string[]>();
const packageImports = new Map<string, number>();

/**
 * 주석은 코드가 아니다.
 *
 * 라우트 팩토리의 머리말에는 소비자가 붙여 넣을 예제가 들어 있다
 * (`export { GET } from "@leviosa-ai/detail-page-editor/server/icons"`). 그것까지 세면
 * 패키지가 자기 자신을 의존한다고 나온다 — 설치 비용은 하나도 안 늘었는데.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

for (const file of FILES) {
  const relative = file.replace(`${PACKAGE}/`, "");
  const source = stripComments(readFileSync(file, "utf8"));
  for (const match of source.matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[1];
    if (specifier.startsWith(".")) continue;
    if (specifier.startsWith("@/")) {
      appImports.set(specifier, [...(appImports.get(specifier) ?? []), relative]);
      continue;
    }
    const name = specifier
      .split("/")
      .slice(0, specifier.startsWith("@") ? 2 : 1)
      .join("/");
    packageImports.set(name, (packageImports.get(name) ?? 0) + 1);
  }
}

describe("셸은 앱 없이 선다", () => {
  it("소스를 실제로 읽었다", () => {
    expect(FILES.length).toBeGreaterThan(150);
  });

  it("소비자 앱의 경로 별칭을 하나도 안 쓴다", () => {
    // 고치는 법은 둘 중 하나다. 데이터 접근이면 `DetailPageHost` 에 얹고,
    // 부품이면 패키지 안으로 들여와 상대경로로 부른다.
    expect([...appImports.keys()].sort()).toEqual([]);
  });
});

describe("셸이 쓰는 npm 패키지", () => {
  it("허용 목록 안에 있다", () => {
    const extra = [...packageImports.keys()]
      .filter((n) => !ALLOWED_PACKAGES.includes(n))
      .sort();
    expect(extra).toEqual([]);
  });

  it("허용해 놓고 안 쓰는 것이 없다", () => {
    const stale = ALLOWED_PACKAGES.filter((n) => !packageImports.has(n));
    expect(stale).toEqual([]);
  });

  /**
   * 쓰는 것을 package.json 에 다 적었는지 본다.
   *
   * 허용 목록과 선언은 **다른 것**이다. 여기 이름을 올려 두면 이 저장소에서는 통과하지만,
   * 설치한 소비자에게는 그 패키지가 없다 — 첫 소비자(leviosa-frontend)가 우연히 같은 것을
   * 들고 있었던 탓에 `clsx`·`cmdk` 넷이 안 적힌 채 두 번 발행됐다. 두 번째 소비자에
   * 꽂고서야 드러났다.
   */
  it("쓰는 것을 package.json 이 다 선언한다", () => {
    const manifest = JSON.parse(
      readFileSync(join(PACKAGE, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    const undeclared = [...packageImports.keys()].filter((name) => !declared.has(name));
    expect(undeclared.sort()).toEqual([]);
  });
});
