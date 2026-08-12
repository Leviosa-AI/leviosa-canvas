import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * 저장소에 심볼릭 링크가 들어오면 안 된다.
 *
 * 워크트리는 루트의 `node_modules` 를 링크로 재사용한다(`ln -s ../../node_modules`).
 * `.gitignore` 가 `node_modules/` 처럼 **슬래시로** 적혀 있으면 그 규칙은 디렉터리만
 * 걸러서 링크가 그대로 통과하고, `git add -A` 한 번에 커밋된다.
 *
 * 그러면 저장소 루트에도 같은 파일이 생긴다 — 거기서 `../../node_modules` 는 저장소
 * **바깥**을 가리키므로, 진짜 환경이 놓여야 할 자리에 끊어진 링크가 앉는다. 받은
 * 사람은 설치가 통째로 안 되는 이유를 한참 찾는다.
 *
 * 조용히 들어오고 조용히 망가지는 종류라 눈으로는 안 잡힌다. 여기서 잡는다.
 */
describe("저장소 파일", () => {
  it("추적되는 심볼릭 링크가 없다", () => {
    // 100644 일반 / 100755 실행 / 120000 심볼릭 링크 / 160000 서브모듈
    const links = execFileSync("git", ["ls-files", "-s"], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.startsWith("120000"))
      .map((line) => line.split("\t")[1]);

    expect(links).toEqual([]);
  });
});
