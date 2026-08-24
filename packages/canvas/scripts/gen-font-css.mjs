#!/usr/bin/env node
// gen-font-css.mjs — SSOT font CSS generator.
//
// Reads the FROZEN font manifest bundled in this package (fonts/font-manifest.json)
// and emits @font-face CSS. The SSOT is the manifest — face metadata (family, weight,
// style, unicode-range) plus, per file, the exact upstream URL it was frozen from and
// its sha256. Both consumers generate their CSS from that one manifest, which is why
// they stay pixel-identical.
//
// Two delivery modes decide only WHERE the bytes come from. The bytes themselves are
// the same either way — the manifest pins them:
//
//   local (default) — copy the frozen woff2 into <out>/fonts and point `src` at the
//     consumer's own prefix. Zero network at render time; the renderer verifies each
//     file's sha256 before serving it.
//   cdn — point `src` straight at manifest `sourceUrl`, for every file whose upstream
//     cannot be repointed at other bytes (gstatic `/s/<family>/vNN/`, jsdelivr
//     `/npm/<pkg>@<version>/`). This is NOT the "each repo re-fetches from a CDN at build
//     time" setup that caused the wrap-divergence postmortem in CLAUDE.md — the URL list is
//     frozen and shared. Never resolve fonts.googleapis.com/css2 at build time to fill it in.
//     Files served from anything weaker — for example third-party
//     `gh/<user>/<repo>@<tag>` paths or unversioned vendor URLs — still ship as bytes,
//     so nothing outside our control can take a font away.
//
// Usage:
//   node gen-font-css.mjs --prefix=/render-fonts/fonts/ --out=/abs/path/render-fonts
//   node gen-font-css.mjs --mode=cdn --out=/abs/path/render-fonts
//
// Writes <out>/font-css.css (all faces), <out>/family-css/<slug>.css (per family, and
// per family+weight) and <out>/font-manifest.json. local mode also writes all of
// <out>/fonts/*.woff2; cdn mode writes only the files it could not delegate.

import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_DIR = path.resolve(HERE, "..", "fonts");
const MANIFEST_PATH = path.join(BUNDLE_DIR, "font-manifest.json");
const BUNDLE_FONTS_DIR = path.join(BUNDLE_DIR, "fonts");

const MODES = ["local", "cdn"];

/**
 * True when this file is the script node was asked to run, rather than an import.
 *
 * Compares realpaths: npm installs a `bin` as a symlink in node_modules/.bin, so
 * `process.argv[1]` is that symlink while `import.meta.url` is the file it points at.
 * Comparing them directly makes the generator a silent no-op for every consumer — which
 * is exactly how it shipped for one commit.
 */
export function invokedAsScript(argv1, moduleUrl) {
  if (!argv1) return false;
  try {
    return pathToFileURL(realpathSync(argv1)).href === moduleUrl;
  } catch {
    return pathToFileURL(argv1).href === moduleUrl;
  }
}

export function parseArgs(argv) {
  const args = {};
  for (const token of argv.slice(2)) {
    const match = token.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

export function slugifyFamily(family) {
  return family
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Whether a pinned URL can be repointed at different bytes by someone other than us.
 *
 * Pinning is necessary but not sufficient. `fonts.gstatic.com/s/<family>/vNN/…` is a Google
 * release path and `cdn.jsdelivr.net/npm/<pkg>@<version>/…` is an npm version — npm refuses
 * to republish a version and blocks unpublish after 72 hours, so both are effectively
 * immutable and permanent.
 *
 * A `cdn.jsdelivr.net/gh/<user>/<repo>@<tag>/…` path is neither. A git tag can be force-moved
 * to different bytes and the repo can be deleted outright, and it belongs to a third party.
 * Those files keep shipping as bytes even in cdn mode: nothing outside our control can then
 * take a font away or change what it measures.
 */
export function isImmutableSource(url) {
  if (!url || !url.startsWith("https://")) return false;
  const { host, pathname } = new URL(url);
  if (host === "fonts.gstatic.com") return /^\/s\/[^/]+\/v\d+\//.test(pathname);
  if (host === "cdn.jsdelivr.net") return /^\/npm\/(@[^/]+\/)?[^/@]+@[^/]+\//.test(pathname);
  return false;
}

/** The files a cdn build still has to ship itself — see isImmutableSource. */
export function bundledFilenames(faces, sourceUrls) {
  return new Set(
    faces
      .map((face) => face.filename)
      .filter((filename) => !isImmutableSource(sourceUrls.get(filename))),
  );
}

/**
 * Where a face's bytes are served from. `local` composes the consumer's prefix with the
 * frozen filename; `cdn` returns the pinned upstream URL the file was frozen from, except
 * for the files whose upstream we do not trust to stay put.
 */
export function resolveFaceUrl(face, { mode, prefix, sourceUrls, bundled }) {
  if (mode === "cdn" && !bundled?.has(face.filename)) {
    const url = sourceUrls.get(face.filename);
    if (!url) throw new Error(`No sourceUrl in manifest for ${face.filename}`);
    return url;
  }
  return `${prefix.replace(/\/$/, "")}/${face.filename}`;
}

export function faceBlock(face, options) {
  const url = resolveFaceUrl(face, options);
  const lines = [
    "@font-face {",
    `  font-family: '${face.family}';`,
    `  font-style: ${face.style || "normal"};`,
    `  font-weight: ${face.weight};`,
    "  font-display: swap;",
    `  src: url("${url}") format('woff2');`,
  ];
  if (face.unicodeRange) lines.push(`  unicode-range: ${face.unicodeRange};`);
  lines.push("}");
  return lines.join("\n");
}

/**
 * woff2-only: the manifest also tracks legacy .woff fallbacks as separate faces, but
 * woff2 is universally supported by every target (Chrome editor + Playwright Chromium).
 * Emitting woff2-only keeps the served metrics identical and avoids mislabeling a .woff
 * file as woff2.
 */
export function woff2Faces(manifest) {
  return (manifest.faces ?? []).filter((face) => face.filename?.endsWith(".woff2"));
}

export function sourceUrlIndex(manifest) {
  return new Map(
    (manifest.files ?? [])
      .filter((file) => file.filename && file.sourceUrl)
      .map((file) => [file.filename, file.sourceUrl]),
  );
}

/**
 * A CDN build is only as safe as its URLs. A relative or unversioned URL would let the
 * upstream swap bytes under a fixed address — different glyph advances, different wrap,
 * the exact failure the freeze exists to prevent — so refuse to emit one.
 */
export function assertPinnedUrl(url, filename) {
  if (!url.startsWith("https://")) {
    throw new Error(`Font sourceUrl must be https: ${filename} -> ${url}`);
  }
  const pinned = /\/v\d+\//.test(url) || /@[\w.\-]+\//.test(url);
  if (!pinned) {
    throw new Error(`Font sourceUrl is not version-pinned: ${filename} -> ${url}`);
  }
}

/**
 * The CSS text for one mode. Pure — the caller writes the files. Returns the combined
 * sheet plus the per-family and per-family+weight sheets, keyed by output filename.
 *
 * Korean families are split by Google into ~90 unicode-range slices, so one family file
 * is one @font-face block per (weight × slice) — Noto Sans KR alone is 780KB of CSS text
 * guarding maybe 30KB of glyphs the page will actually fetch. A slide uses one or two
 * weights, so the editor asks for the weight file and reads ~1/9 as much. The whole-family
 * file stays as the fallback for callers that don't know the weight.
 */
export function buildSheets(faces, options) {
  const header = "/* Generated from @leviosa-ai/canvas/fonts manifest. Do not edit by hand. */";
  const byFamily = new Map();
  const byFamilyWeight = new Map();
  for (const face of faces) {
    const family = byFamily.get(face.family) ?? [];
    family.push(face);
    byFamily.set(face.family, family);

    const weightKey = `${face.family}\n${face.weight}`;
    const weight = byFamilyWeight.get(weightKey) ?? [];
    weight.push(face);
    byFamilyWeight.set(weightKey, weight);
  }

  const sheet = (list) => `${[header, ...list.map((f) => faceBlock(f, options))].join("\n")}\n`;
  const familySheets = new Map();
  for (const [family, list] of byFamily) {
    familySheets.set(`${slugifyFamily(family)}.css`, sheet(list));
  }
  for (const [key, list] of byFamilyWeight) {
    const [family, weight] = key.split("\n");
    familySheets.set(`${slugifyFamily(family)}-${weight}.css`, sheet(list));
  }

  return { combined: sheet(faces), familySheets, families: byFamily.size };
}

export async function readManifest() {
  return JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
}

async function copyDir(src, dest) {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.cp(src, dest, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv);
  const mode = args.mode ?? "local";
  if (!MODES.includes(mode)) {
    throw new Error(`Unknown --mode=${mode} (expected one of ${MODES.join(", ")})`);
  }
  const prefix = args.prefix ?? "/render-fonts/fonts/";
  const out = args.out ? path.resolve(args.out) : path.resolve("public/render-fonts");

  const manifest = await readManifest();
  const faces = woff2Faces(manifest);
  if (faces.length === 0) throw new Error(`No woff2 faces in manifest: ${MANIFEST_PATH}`);

  const sourceUrls = sourceUrlIndex(manifest);
  const bundled = mode === "cdn" ? bundledFilenames(faces, sourceUrls) : null;
  if (mode === "cdn") {
    for (const face of faces) {
      if (bundled.has(face.filename)) continue;
      assertPinnedUrl(sourceUrls.get(face.filename), face.filename);
    }
  }

  const options = { mode, prefix, sourceUrls, bundled };
  const { combined, familySheets, families } = buildSheets(faces, options);

  await fs.mkdir(out, { recursive: true });
  // The manifest travels in both modes: it carries the sha256 a consumer needs to verify
  // bytes, whether it serves them itself or fetches them from the pinned URL.
  await fs.copyFile(MANIFEST_PATH, path.join(out, "font-manifest.json"));
  const fontsOut = path.join(out, "fonts");
  if (mode === "local") {
    await copyDir(BUNDLE_FONTS_DIR, fontsOut);
  } else {
    // Rebuild rather than prune: bytes left by an earlier local build would keep serving
    // files nothing points at, and would hide the exact mutable-source subset for this build.
    await fs.rm(fontsOut, { recursive: true, force: true });
    if (bundled.size > 0) {
      await fs.mkdir(fontsOut, { recursive: true });
      for (const filename of bundled) {
        await fs.copyFile(path.join(BUNDLE_FONTS_DIR, filename), path.join(fontsOut, filename));
      }
    }
  }

  await fs.writeFile(path.join(out, "font-css.css"), combined);

  const familyDir = path.join(out, "family-css");
  await fs.rm(familyDir, { recursive: true, force: true });
  await fs.mkdir(familyDir, { recursive: true });
  for (const [filename, content] of familySheets) {
    await fs.writeFile(path.join(familyDir, filename), content);
  }

  const bundledNote =
    mode === "cdn" && bundled.size > 0
      ? `, ${bundled.size} files bundled (upstream not immutable)`
      : "";
  console.log(
    `[konva] font css generated: ${faces.length} faces, ${families} families, ` +
      `${familySheets.size} family css files, mode=${mode}, prefix=${prefix}` +
      `${bundledNote} -> ${out}`,
  );
}

if (invokedAsScript(process.argv[1], import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
