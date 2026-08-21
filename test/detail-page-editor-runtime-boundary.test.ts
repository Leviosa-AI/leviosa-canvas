/**
 * 셸의 **런타임** 경계.
 *
 * `detail-page-editor-boundary.test.ts` 는 import 를 잰다. 그건 이미 0이었고, 그래서
 * "셸은 앱 없이 선다"고 믿었다. 두 번째 소비자(leviosa-agency)에 꽂아 보니 안 섰다.
 *
 * import 는 하나도 안 걸렸는데 화면이 죽은 이유는 결합이 **주소**로 남아 있어서였다.
 * 소스 곳곳에 `/api/icons`, `/render-fonts/font-css.css` 같은 루트 절대경로가 박혀
 * 있었고, 첫 소비자(leviosa-frontend)가 마침 그 경로에 라우트와 정적 자산을 갖고 있어서
 * 아무 일도 안 났다. 두 번째 소비자는 `basePath: "/agency"` 라 그 주소가 앱 바깥을
 * 가리켰고, 사진(400)·아이콘(404)·폰트(404)가 한꺼번에 떨어졌다.
 *
 * 그래서 여기서는 **소스에 박힌 주소**를 센다. 컴파일러가 못 잡는 자리다.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PACKAGE = join(process.cwd(), "packages", "detail-page-editor");

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

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * 앱이 어디에 마운트됐는지에 따라 달라지는 주소들.
 *
 * 목록을 늘려야 하는 상황이라면 십중팔구 새 자산 묶음을 소비자 `public/` 에 요구하는
 * 중이다. 그 전에 `DetailPageEditorAssets` 에 이름을 하나 열어야 한다.
 */
const MOUNT_DEPENDENT = [
  "/api/",
  "/render-fonts",
  "/detail-font-previews",
  "/cardnews-font-previews",
  "/gif-effect-previews",
];

/**
 * 예외는 둘뿐이고, 둘 다 **부르는 주소가 아니다.**
 *
 * - `runtime-config.ts` 가 기본값을 적는 자리다. 여기가 정본이다.
 * - `asset-bytes-url.ts` 의 `/api/v1/brands/assets/file/` 는 이미 저장된 문서 안의
 *   주소를 **알아보는 패턴**이다. 우리가 그 주소로 가는 것이 아니라, 문서에 박혀 온
 *   것을 보고 `raw=1` 을 붙인다. 소싱 서버가 정하는 모양이라 우리 설정에 없다.
 * - `authoring-image-src.ts` 의 `/api/v2/detail-pages/brand-authoring/` 도 같은 부류다.
 *   저작이 문서에 박아 둔 사진 주소를 보고 (잡, 이름, 서명)을 읽어 낼 뿐, 그 주소로
 *   가지 않는다. 승격 요청은 호스트가 준 `api` 를 거친다.
 */
const EXEMPT = new Set([
  "lib/detail-page/runtime-config.ts",
  "lib/detail-page/asset-bytes-url.ts",
  "lib/detail-page/authoring-image-src.ts",
]);

describe("셸은 자기가 어디에 마운트됐는지 모른다", () => {
  const offenders: Array<{ file: string; line: string }> = [];

  for (const file of sourceFiles(PACKAGE)) {
    const relative = file.replace(`${PACKAGE}/`, "");
    if (EXEMPT.has(relative)) continue;
    const source = stripComments(readFileSync(file, "utf8"));
    for (const raw of source.split("\n")) {
      // 문자열 리터럴 안에서 슬래시로 시작하는 주소만 본다.
      for (const match of raw.matchAll(/(["'`])(\/[^"'`\s${}]*)/g)) {
        const path = match[2];
        if (!MOUNT_DEPENDENT.some((prefix) => path.startsWith(prefix)))
          continue;
        offenders.push({ file: relative, line: raw.trim() });
      }
    }
  }

  it("루트 절대경로를 직접 안 적는다", () => {
    // 고치는 법: `editorEndpoint(...)` 나 `editorAssetBase(...)` 를 거친다.
    // 그래야 `basePath` 를 쓰는 소비자에서도 같은 주소로 닿는다.
    expect(offenders).toEqual([]);
  });

  it("소스를 실제로 읽었다", () => {
    expect(sourceFiles(PACKAGE).length).toBeGreaterThan(150);
  });
});
