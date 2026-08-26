// Companion to the .mjs CLI — see gen-font-css.test.mjs for why these tests are not .ts.
import { describe, expect, it } from "vitest";

import { readManifest } from "../scripts/gen-font-css.mjs";
import {
  sourceIntegrity,
  statusFailure,
  upstreamGroup,
} from "../scripts/check-font-urls.mjs";

describe("failure classification", () => {
  // The check exists to catch a URL that rotted, and it is worthless if a throttled
  // sweep turns it red — a check people rerun until it passes catches nothing.
  it("treats a 4xx as rot and a 429/5xx as transient", () => {
    expect(statusFailure(404).kind).toBe("rot");
    expect(statusFailure(410).kind).toBe("rot");
    expect(statusFailure(403).kind).toBe("rot");
    expect(statusFailure(429).kind).toBe("transient");
    expect(statusFailure(503).kind).toBe("transient");
  });
});

describe("source integrity", () => {
  it("checks a converted source against its source bytes and hash", () => {
    expect(
      sourceIntegrity({
        bytes: 319168,
        sha256: "woff2-hash",
        sourceBytes: 1377180,
        sourceSha256: "ttf-hash",
        conversion: "woff2",
      }),
    ).toEqual({ bytes: 1377180, sha256: "ttf-hash" });
  });

  it("checks an unconverted file against its bundled integrity", () => {
    expect(sourceIntegrity({ bytes: 42, sha256: "same-hash" })).toEqual({
      bytes: 42,
      sha256: "same-hash",
    });
  });
});

describe("upstreamGroup", () => {
  // A deleted repo or tag takes its whole group down at once — that is the signal the
  // run can still trust when individual requests are timing out.
  it("groups a Google family release by /s/<family>/vNN/", () => {
    expect(
      upstreamGroup("https://fonts.gstatic.com/s/dokdo/v23/esDf315XNuCB.99.woff2"),
    ).toBe("fonts.gstatic.com/s/dokdo/v23/");
    expect(
      upstreamGroup("https://fonts.gstatic.com/s/dokdo/v23/esDf315XNuCB.34.woff2"),
    ).toBe(upstreamGroup("https://fonts.gstatic.com/s/dokdo/v23/other.1.woff2"));
  });

  it("groups a jsdelivr path by its pinned tag", () => {
    expect(
      upstreamGroup("https://cdn.jsdelivr.net/gh/projectnoonnu/2404@1.0/Pretendard.woff2"),
    ).toBe("cdn.jsdelivr.net/gh/projectnoonnu/2404@1.0/");
  });

  it("separates two tags of the same repo", () => {
    expect(upstreamGroup("https://cdn.jsdelivr.net/gh/a/b@1.0/x.woff2")).not.toBe(
      upstreamGroup("https://cdn.jsdelivr.net/gh/a/b@2.0/x.woff2"),
    );
  });

  it("covers every URL in the manifest", async () => {
    const manifest = await readManifest();
    const groups = new Set();
    for (const file of manifest.files ?? []) {
      if (!file.sourceUrl) continue;
      const group = upstreamGroup(file.sourceUrl);
      expect(group).toBeTruthy();
      expect(file.sourceUrl.startsWith(`https://${group}`)).toBe(true);
      groups.add(group);
    }
    // Far fewer groups than files — otherwise "the whole group failed" would mean
    // "one file failed" and the tolerance would do nothing.
    expect(groups.size).toBeLessThan((manifest.files ?? []).length / 10);
  });
});
