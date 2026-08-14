import { describe, expect, it } from "vitest";

import { History } from "../src";

describe("dpnext editor history", () => {
  it("restores the original SHA after one hundred undo and redo operations", () => {
    const history = new History({ revision: 0, sha: "original" });
    for (let revision = 1; revision <= 100; revision += 1) {
      history.push({ revision, sha: `sha-${revision}` });
    }
    for (let index = 0; index < 100; index += 1) history.undo();
    expect(history.current()).toEqual({ revision: 0, sha: "original" });
    for (let index = 0; index < 100; index += 1) history.redo();
    expect(history.current()).toEqual({ revision: 100, sha: "sha-100" });
  });
});
