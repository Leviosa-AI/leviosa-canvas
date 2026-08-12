/**
 * 패키지 경계 (G7).
 *
 * 이 엔진은 `@leviosa-ai/canvas`로 발행되어 `leviosa-frontend`와 `leviosa-agency`가
 * 설치해 쓴다. **한쪽 앱 안에서만 되는 것**이 하나라도 섞여 있으면 다른 쪽에서 안 돈다.
 *
 * 저장소를 가른 뒤로 앱 경로 별칭(`@/…`)은 애초에 존재할 수 없게 됐다 — 그래서 그
 * 검사는 여기서 빠졌다. 대신 여기서 재는 것은 셋이다.
 *
 * 1. 엔진이 `canvas`를 안 부른다 — 이건 애초에 이 프로젝트의 전제다.
 * 2. 바깥에서 끌어오는 것이 `konva`·`react`·`react-konva` 셋뿐이다. 이 목록이 그대로
 *    peerDependencies다. 여기 새 이름이 늘면 소비자 전부가 그걸 깔아야 한다.
 * 3. **매니페스트 `exports`가 실재하는 파일을 가리킨다.** 열거형 서브패스를 쓰기로 한
 *    이상(release 문서 §2), 파일을 옮기고 매니페스트를 안 고치면 소비자가 설치한
 *    뒤에야 죽는다.
 *
 * 원본 대조(`detail-page-canvas`의 순수 모듈과 글자 단위 비교)는 앱 쪽 관심사라
 * `leviosa-frontend`에 남겼다. 관문 판정 넷(G0·G4·G6)도 같은 이유로 거기 있다.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 엔진 소스 전부(테스트 제외). */
function sourceFiles(dir: string = ROOT): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

describe("엔진은 어느 앱 바깥에서도 돈다", () => {
  const files = sourceFiles();

  it("소스를 실제로 읽었다", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("앱 경로 별칭(@/)을 안 쓴다", () => {
    const guilty = files.filter((path) => readFileSync(path, "utf8").includes('from "@/'));
    expect(guilty.map((path) => path.replace(ROOT, ""))).toEqual([]);
  });

  it("canvas를 안 부른다", () => {
    const guilty = files.filter((path) => /from ["']canvas/.test(readFileSync(path, "utf8")));
    expect(guilty.map((path) => path.replace(ROOT, ""))).toEqual([]);
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
    expect([...external].sort()).toEqual(["konva", "react", "react-konva"]);
  });
});

describe("매니페스트가 실재를 가리킨다", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    exports: Record<string, string>;
    peerDependencies: Record<string, string>;
  };

  it("exports 항목이 전부 있는 파일이다", () => {
    const missing = Object.entries(manifest.exports)
      .filter(([, target]) => {
        try {
          return !statSync(join(ROOT, target)).isFile();
        } catch {
          return true;
        }
      })
      .map(([subpath]) => subpath);
    expect(missing).toEqual([]);
  });

  it("peerDependencies가 실제 외부 의존과 같다", () => {
    // react-dom은 react-konva가 요구하므로 목록에 있고, 소스에는 안 나온다.
    const declared = Object.keys(manifest.peerDependencies).filter((n) => n !== "react-dom");
    expect(declared.sort()).toEqual(["konva", "react", "react-konva"]);
  });
});
