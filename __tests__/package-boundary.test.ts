/**
 * 패키지 경계 (G7).
 *
 * 이 엔진은 언젠가 `@leviosa/canvas`로 떨어져 `leviosa-agency`가 설치해 쓴다. 그때
 * **앱 안에서만 되는 것**이 하나라도 섞여 있으면 거기서 안 돈다 — 그리고 그 사실은
 * 옮겨 심어 본 뒤에야 알게 된다. 그래서 경계를 여기서 계속 잰다.
 *
 * 재는 것은 셋이다.
 *
 * 1. 엔진 소스가 `@/…`(앱 전용 경로 별칭)를 안 쓴다.
 * 2. 엔진 소스가 `polotno`를 안 부른다 — 이건 애초에 이 프로젝트의 전제다.
 * 3. 패키지 안으로 들여온 순수 모듈이 **원본과 안 갈라졌다.** 하드룰 1 때문에 기존
 *    경로의 원본은 그대로 두고 복사해 왔다. 둘이 갈라지면 G9에서 원본을 지울 때
 *    조용히 동작이 바뀐다.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ENGINE = join(process.cwd(), "src", "lib", "leviosa-canvas");
const FROZEN = join(process.cwd(), "src", "lib", "detail-page-polotno");

/** 엔진 소스 전부(테스트 제외). */
function sourceFiles(dir: string = ENGINE): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/** 첫 `export`부터 끝까지. 주석·import 차이를 빼고 **코드만** 견준다. */
function bodyOf(text: string): string {
  const at = text.indexOf("\nexport ");
  return at < 0 ? text : text.slice(at);
}

describe("엔진은 앱 바깥에서도 돈다", () => {
  const files = sourceFiles();

  it("소스를 실제로 읽었다", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("앱 경로 별칭(@/)을 안 쓴다", () => {
    const guilty = files.filter((path) => readFileSync(path, "utf8").includes('from "@/'));
    expect(guilty.map((path) => path.replace(process.cwd(), ""))).toEqual([]);
  });

  it("polotno를 안 부른다", () => {
    const guilty = files.filter((path) => /from ["']polotno/.test(readFileSync(path, "utf8")));
    expect(guilty.map((path) => path.replace(process.cwd(), ""))).toEqual([]);
  });

  it("런타임 의존은 react·konva 계열뿐이다", () => {
    const external = new Set<string>();
    for (const path of files) {
      for (const match of readFileSync(path, "utf8").matchAll(/from "([^".][^"]*)"/g)) {
        const source = match[1];
        if (source.startsWith(".")) continue;
        external.add(source.split("/").slice(0, source.startsWith("@") ? 2 : 1).join("/"));
      }
    }
    // peerDependencies가 될 목록이다. 여기 새 이름이 늘면 agency도 그걸 깔아야 한다.
    expect([...external].sort()).toEqual(["konva", "react", "react-konva"]);
  });
});

describe("들여온 순수 모듈이 원본과 안 갈라졌다", () => {
  it.each(["konva-fallback", "clip-rect", "bubble-path"])(
    "%s — 글자 하나까지 같다",
    (name) => {
      const mine = readFileSync(join(ENGINE, "paint", `${name}.ts`), "utf8");
      const original = readFileSync(join(FROZEN, `${name}.ts`), "utf8");
      expect(mine).toBe(original);
    },
  );

  it("text-highlight-bands — 코드가 같다 (import 한 줄만 다르다)", () => {
    // 원본은 `isTransparentColor`를 옆 모듈에서 끌어온다. 패키지 안에서는 앱 모듈을
    // 못 부르므로 그 열 줄짜리 순수 함수만 데려왔다 — 그 차이 말고는 같아야 한다.
    const mine = readFileSync(join(ENGINE, "paint", "text-highlight-bands.ts"), "utf8");
    const original = readFileSync(join(FROZEN, "text-highlight-bands.ts"), "utf8");
    expect(bodyOf(mine)).toBe(bodyOf(original));
  });
});
