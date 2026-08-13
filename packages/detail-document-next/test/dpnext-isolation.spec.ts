import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sources(path) : [path];
  }).filter((path) => /\.(ts|tsx)$/.test(path));
}

describe("dpnext package isolation", () => {
  it("keeps Konva and legacy canvas imports out of every Next package", () => {
    const nextPackages = [
      "packages/detail-document-next",
      "packages/detail-dom-renderer-next",
      "packages/detail-dom-editor-next",
    ];
    const violations = nextPackages.flatMap((directory) =>
      sources(join(root, directory)).flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return /from ["'][^"']*(?:konva|packages\/canvas)/i.test(source)
          ? [relative(root, path)]
          : [];
      }),
    );
    expect(violations).toEqual([]);
  });

  it("uses a unique dpnext test and package namespace", () => {
    const testFiles = sources(join(root, "packages"))
      .map((path) => relative(root, path))
      .filter((path) => path.includes("/test/") && path.includes("detail-") && !path.includes("/canvas/"));
    expect(testFiles.every((path) => /\/dpnext-[^/]+\.spec\.(ts|tsx)$/.test(path))).toBe(true);
  });
});
