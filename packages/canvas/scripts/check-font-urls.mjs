#!/usr/bin/env node
// check-font-urls.mjs — liveness check for the frozen font URLs.
//
// --mode=cdn makes every consumer fetch woff2 straight from the address recorded in
// fonts/font-manifest.json. Those addresses are version-pinned, but pinned is not the
// same as permanent: a jsdelivr `gh/<user>/<repo>@<tag>` path dies if the upstream repo
// or tag is deleted, and that failure would only surface as a render error in prod.
// This walks every unique sourceUrl and checks it still serves the exact byte count the
// manifest froze. For a source converted during freezing, the manifest stores both source
// and output integrity so the upstream TTF is checked against the TTF, not the WOFF2.
//
// Byte count, not sha256, on purpose: a full download of all files is ~81MB, while a
// HEAD is a few hundred bytes. Content-Length disagreeing with the manifest already
// means the bytes moved. Use --full to actually download and hash instead.
//
// What counts as a failure, and why it is not "any request that did not succeed":
// sweeping 5500 URLs is bursty enough that gstatic throttles the caller — a CI run
// timed out on 204 URLs that all answered fine from a laptop minutes earlier. Failing
// on that would make this check flaky noise, and a check people rerun until it goes
// green catches nothing. So a run fails on evidence of *rot*, not of throttling:
//
//   - a definitive 4xx (404/410/403 …) on any URL — the file is gone or forbidden
//   - a whole upstream group unreachable — every URL under one `gh/<user>/<repo>@<tag>`
//     or one `/s/<family>/vNN/` failing together is what a deleted repo or tag looks
//     like, whatever error it surfaces as
//
// Scattered timeouts are reported and tolerated. `--strict` fails on any of them.
//
// Usage:
//   node scripts/check-font-urls.mjs
//   node scripts/check-font-urls.mjs --limit=50 --concurrency=16
//   node scripts/check-font-urls.mjs --full --strict

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { invokedAsScript } from "./gen-font-css.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(HERE, "..", "fonts", "font-manifest.json");

function parseArgs(argv) {
  const args = {};
  for (const token of argv.slice(2)) {
    const match = token.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) args[match[1]] = match[2] ?? "true";
  }
  return args;
}

/** `rot` means the file is gone or changed; `transient` means we could not tell. */
const rot = (message) => ({ kind: "rot", message });
const transient = (message) => ({ kind: "transient", message });

/**
 * Retries before giving up. Even at low concurrency a 5500-URL sweep gets throttled, and
 * one lost connection says nothing about whether the file exists.
 */
async function fetchRetrying(url, init, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      const backoff = 500 * 2 ** (attempt - 1) * (1 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
    try {
      const response = await fetch(url, init);
      // 429/5xx is the CDN asking us to slow down, not a missing file.
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  const code = lastError?.cause?.code;
  throw new Error(`${lastError?.message ?? "fetch failed"}${code ? ` (${code})` : ""}`);
}

/** A 4xx that is not 429 is the upstream telling us the file is not there. */
export function statusFailure(status) {
  if (status >= 400 && status < 500 && status !== 429) return rot(`HTTP ${status}`);
  return transient(`HTTP ${status}`);
}

export function sourceIntegrity(file) {
  return {
    bytes: file.sourceBytes ?? file.bytes,
    sha256: file.sourceSha256 ?? file.sha256,
  };
}

async function checkHead(file) {
  const response = await fetchRetrying(file.sourceUrl, { method: "HEAD", redirect: "follow" });
  if (!response.ok) return statusFailure(response.status);
  const length = Number(response.headers.get("content-length"));
  // A CDN that omits Content-Length (or answers a HEAD without one) is not a failure —
  // it just means this cheap check cannot prove the size. --full can.
  if (!Number.isFinite(length) || length === 0) return null;
  const expected = sourceIntegrity(file);
  if (length !== expected.bytes) return rot(`size ${length} != manifest ${expected.bytes}`);
  return null;
}

async function checkFull(file) {
  const response = await fetchRetrying(file.sourceUrl, { redirect: "follow" });
  if (!response.ok) return statusFailure(response.status);
  const body = Buffer.from(await response.arrayBuffer());
  const expected = sourceIntegrity(file);
  if (body.length !== expected.bytes) {
    return rot(`size ${body.length} != manifest ${expected.bytes}`);
  }
  const sha256 = crypto.createHash("sha256").update(body).digest("hex");
  if (sha256 !== expected.sha256) {
    return rot(`sha256 ${sha256.slice(0, 12)}… != manifest ${expected.sha256.slice(0, 12)}…`);
  }
  return null;
}

/**
 * The upstream a URL belongs to: one jsdelivr `gh/<user>/<repo>@<tag>` (or npm package),
 * or one Google family release `/s/<family>/vNN/`. A repo or tag being deleted takes its
 * whole group down at once, which is the signal we can trust through the throttling noise.
 */
export function upstreamGroup(url) {
  const parsed = new URL(url);
  const google = parsed.pathname.match(/^\/s\/[^/]+\/v\d+\//);
  if (google) return `${parsed.host}${google[0]}`;
  const pinned = parsed.pathname.match(/^.*@[\w.\-]+\//);
  if (pinned) return `${parsed.host}${pinned[0]}`;
  return `${parsed.host}${parsed.pathname.replace(/\/[^/]*$/, "/")}`;
}

/** Fixed-size worker pool — 5500 concurrent fetches would just get us rate-limited. */
async function pooled(items, size, worker) {
  const results = [];
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  // Deliberately modest: gstatic starts resetting connections well before this check
  // gets fast enough to matter, and a full pass is a few minutes either way.
  const concurrency = Number(args.concurrency ?? 8);
  const full = args.full === "true";

  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  // One entry per URL: the manifest lists a file per (family, slice), and Pretendard's
  // woff/woff2 pair can share nothing, but duplicates would still double the requests.
  const byUrl = new Map();
  for (const file of manifest.files ?? []) {
    if (file.sourceUrl && !byUrl.has(file.sourceUrl)) byUrl.set(file.sourceUrl, file);
  }
  let files = [...byUrl.values()];
  const missing = (manifest.files ?? []).filter((file) => !file.sourceUrl);
  if (args.limit) files = files.slice(0, Number(args.limit));

  const check = full ? checkFull : checkHead;
  let done = 0;
  const failures = [];
  const groupTotals = new Map();
  const groupFailures = new Map();
  for (const file of files) {
    const group = upstreamGroup(file.sourceUrl);
    groupTotals.set(group, (groupTotals.get(group) ?? 0) + 1);
  }

  await pooled(files, concurrency, async (file) => {
    let failure;
    try {
      failure = await check(file);
    } catch (error) {
      failure = transient(error instanceof Error ? error.message : String(error));
    }
    if (failure) {
      const group = upstreamGroup(file.sourceUrl);
      groupFailures.set(group, (groupFailures.get(group) ?? 0) + 1);
      failures.push({ file, group, ...failure });
    }
    done += 1;
    if (done % 500 === 0) console.log(`[konva] checked ${done}/${files.length}`);
  });

  // An upstream whose every URL failed is gone, whatever error it surfaced as.
  const deadGroups = new Set(
    [...groupFailures].filter(([g, n]) => n === groupTotals.get(g)).map(([g]) => g),
  );

  const strict = args.strict === "true";
  const fatal = failures.filter(
    (f) => f.kind === "rot" || deadGroups.has(f.group) || strict,
  );
  const tolerated = failures.filter((f) => !fatal.includes(f));

  for (const file of missing) {
    fatal.push({ file, kind: "rot", message: "no sourceUrl in manifest" });
  }

  if (tolerated.length > 0) {
    console.warn(
      `[konva] ${tolerated.length} URL(s) unverified (throttling/timeouts), spread over ` +
        `${new Set(tolerated.map((f) => f.group)).size} upstreams — not treated as rot`,
    );
  }

  if (fatal.length > 0) {
    console.error(`[konva] ${fatal.length} font URL(s) failed:`);
    if (deadGroups.size > 0) {
      console.error(`[konva] upstream(s) with every URL failing: ${[...deadGroups].join(", ")}`);
    }
    for (const { file, message } of fatal.slice(0, 40)) {
      console.error(`- ${file.filename}: ${message}\n  ${file.sourceUrl ?? "(none)"}`);
    }
    if (fatal.length > 40) console.error(`- …and ${fatal.length - 40} more`);
    process.exit(1);
  }

  console.log(
    `[konva] ${files.length - tolerated.length}/${files.length} font URL(s) live, ` +
      `${full ? "sha256" : "size"} matches the manifest`,
  );
}

if (invokedAsScript(process.argv[1], import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
