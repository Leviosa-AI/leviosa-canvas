import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import * as lucide from "lucide-react";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 아이콘 이름이 설치된 lucide 에 실제로 있는지 잰다.
 *
 * `lucide-react` peer 를 `^0.563.0 || ^1.0.0` 으로 넓혔다. 두 번째 소비자(에이전시)가 1.x 를
 * 쓰는데 좁은 범위가 설치를 통째로 막았기 때문인데, 넓히고 나면 이번에는 **다른 위험**이
 * 열린다: 메이저를 건너뛰면서 이름이 바뀌거나 사라진 아이콘이 있으면, 그 값은
 * `undefined` 가 되고 React 는 그 자리에서 "Element type is invalid" 로 죽는다.
 *
 * 타입 검사로는 안 잡힌다 — 타입은 설치된 그 버전 하나만 본다. 여기서 잡는다.
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

function importedIcons(): string[] {
  const names = new Set<string>();
  for (const file of sourceFiles(PKG)) {
    const text = readFileSync(file, "utf8");
    const re = /import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      for (const part of match[1].split(",")) {
        // `Image as ImageIcon` 는 원본 이름이 lucide 쪽 것이다.
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (/^[A-Z][A-Za-z0-9]*$/.test(name)) names.add(name);
      }
    }
  }
  return [...names].sort();
}

describe("lucide 아이콘", () => {
  it("셸이 부르는 이름이 설치된 버전에 다 있다", () => {
    const names = importedIcons();
    expect(names.length).toBeGreaterThan(30);
    const missing = names.filter(
      (name) => (lucide as Record<string, unknown>)[name] === undefined,
    );
    expect(missing).toEqual([]);
  });
});
