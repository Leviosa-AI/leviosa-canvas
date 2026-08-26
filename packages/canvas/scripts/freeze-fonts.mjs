// freeze-fonts.mjs — rebuild the frozen font bundle from fonts/catalog.json.
//
// The catalog is the SSOT for *which* fonts exist; this script turns it into the
// frozen bytes both consumers render with (fonts/fonts/*.woff2 + fonts/font-manifest.json).
// The @font-face CSS itself is NOT written here — each consumer generates it at build
// time from the manifest via gen-font-css.mjs, because only the URL prefix differs.
//
//   ALLOW_FONT_MANIFEST_UPDATE=1 npm run fonts:freeze
//   FREEZE_NEW_FONTS_ONLY=1 ALLOW_FONT_MANIFEST_UPDATE=1 npm run fonts:freeze
//   FREEZE_FAMILIES=NanumSquareNeo,NanumSquareRound ALLOW_FONT_MANIFEST_UPDATE=1 npm run fonts:freeze
//
// Three catalog source types:
//   google — folded into one fonts.googleapis.com/css2 request (unicode-range slices)
//   css    — an upstream stylesheet fetched as-is (Pretendard)
//   files  — direct woff2 URLs; @font-face blocks are synthesized here (whole-font, no slices)

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { compress as compressWoff2 } from "woff2-encoder";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_DIR = path.resolve(HERE, "..", "fonts");
const CATALOG_PATH = path.join(BUNDLE_DIR, "catalog.json");

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/145.0.7632.6 Safari/537.36";
const FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 30_000;
const FETCH_RETRY_BASE_DELAY_MS = 1_000;

function extensionForUrl(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return ext || ".woff2";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await fetch(url, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
      if (attempt === FETCH_ATTEMPTS) break;
      const delayMs = FETCH_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(`Fetch failed for ${url}; retrying in ${delayMs}ms (${attempt}/${FETCH_ATTEMPTS})`);
      await delay(delayMs);
    }
  }
  throw lastError;
}

async function fetchText(url) {
  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

async function fetchFontFile(url, cache, fontsDir, conversion) {
  const cacheKey = conversion ? `${url}#${conversion}` : url;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error(`Failed to fetch font ${url}: ${response.status}`);
  const sourceData = Buffer.from(await response.arrayBuffer());
  const sourceSha256 = crypto.createHash("sha256").update(sourceData).digest("hex");
  const data = conversion === "woff2"
    ? Buffer.from(await compressWoff2(sourceData))
    : sourceData;
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");
  const filename = `${hash}${conversion === "woff2" ? ".woff2" : extensionForUrl(url)}`;
  await fs.writeFile(path.join(fontsDir, filename), data);
  const result = {
    filename,
    sourceUrl: url,
    ...(conversion
      ? { sourceSha256, sourceBytes: sourceData.length, conversion }
      : {}),
    sha256,
    bytes: data.length,
    cssUrl: `/render-fonts/fonts/${filename}`,
  };
  cache.set(cacheKey, result);
  return result;
}

/**
 * Reuse already-frozen bytes whose source URL is unchanged. A catalog-only addition
 * should not re-download and rewrite the several-thousand-file Google bundle: besides
 * being slow, deleting the live directory before all fetches finish leaves a broken
 * checkout when the command is interrupted.
 */
async function seedFrozenCache(manifestPath, currentFontsDir, nextFontsDir) {
  const cache = new Map();
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  await fs.cp(currentFontsDir, nextFontsDir, { recursive: true });
  for (const file of manifest.files ?? []) {
    if (!file.sourceUrl || !file.filename) continue;
    cache.set(file.sourceUrl, {
      ...file,
      cssUrl: `/render-fonts/fonts/${file.filename}`,
    });
  }
  return cache;
}

async function replaceDirectory(currentDir, nextDir) {
  const backupDir = `${currentDir}.previous-${process.pid}`;
  await fs.rename(currentDir, backupDir);
  try {
    await fs.rename(nextDir, currentDir);
    await fs.rm(backupDir, { recursive: true, force: true });
  } catch (error) {
    await fs.rename(backupDir, currentDir).catch(() => undefined);
    throw error;
  }
}

async function localizeFontUrls(css, baseUrl, cache, fontsDir, conversions) {
  const withoutLocalSources = css.replace(/\s*local\([^)]+\),?/g, "");
  const urlRegex = /url\(([^)]+)\)/g;
  let result = "";
  let lastIndex = 0;
  for (const match of withoutLocalSources.matchAll(urlRegex)) {
    result += withoutLocalSources.slice(lastIndex, match.index);
    const raw = match[1].trim().replace(/^["']|["']$/g, "");
    if (raw.startsWith("data:")) {
      result += match[0];
    } else {
      const absoluteUrl = new URL(raw, baseUrl).toString();
      const fontFile = await fetchFontFile(
        absoluteUrl,
        cache,
        fontsDir,
        conversions.get(absoluteUrl),
      );
      result += `url("${fontFile.cssUrl}")`;
    }
    lastIndex = match.index + match[0].length;
  }
  result += withoutLocalSources.slice(lastIndex);
  return result;
}

// ── catalog → fetchable sources ──────────────────────────────────────────────

function googleCss2Url(fonts) {
  // css2 requires the weight list ascending; every weight here came from the
  // Google font metadata, so each one is a real static instance.
  const families = fonts
    .map((font) => {
      const weights = [...font.weights].sort((a, b) => a - b).join(";");
      return `family=${font.family.replace(/ /g, "+")}:wght@${weights}`;
    })
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

function synthesizeFaceCss(font) {
  return font.source.files
    .map((file) =>
      [
        "@font-face {",
        `  font-family: '${font.family}';`,
        `  font-style: ${file.style || "normal"};`,
        `  font-weight: ${file.weight};`,
        "  font-display: swap;",
        `  src: url(${file.url}) format('woff2');`,
        "}",
      ].join("\n"),
    )
    .join("\n");
}

/** Every stylesheet to freeze, as {css, baseUrl} — fetched or synthesized. */
async function collectSources(catalog) {
  const sources = [];
  const google = catalog.fonts.filter((font) => font.source.type === "google");
  if (google.length) {
    const url = googleCss2Url(google);
    sources.push({ css: await fetchText(url), baseUrl: url });
  }
  for (const font of catalog.fonts) {
    if (font.source.type === "css") {
      sources.push({ css: await fetchText(font.source.url), baseUrl: font.source.url });
    } else if (font.source.type === "files") {
      sources.push({ css: synthesizeFaceCss(font), baseUrl: font.source.files[0].url });
    }
  }
  return sources;
}

// ── manifest ─────────────────────────────────────────────────────────────────

function parseFontFaceManifest(css, cache) {
  const filesByFilename = new Map(
    Array.from(cache.values()).map((file) => [file.filename, file]),
  );
  const entries = [];
  for (const match of css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
    const block = match[0];
    const family = block.match(/font-family:\s*['"]?([^;'"]+)/)?.[1]?.trim();
    const weight = block.match(/font-weight:\s*([^;]+)/)?.[1]?.trim();
    const style = block.match(/font-style:\s*([^;]+)/)?.[1]?.trim() || "normal";
    const unicodeRange = block.match(/unicode-range:\s*([^;]+)/)?.[1]?.trim() || null;
    if (!family || !weight) continue;
    for (const urlMatch of block.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      const filename = urlMatch[1].split("/").pop();
      const file = filename ? filesByFilename.get(filename) : undefined;
      if (!file) continue;
      entries.push({
        family,
        weight,
        style,
        unicodeRange,
        filename: file.filename,
        sha256: file.sha256,
        bytes: file.bytes,
        sourceUrl: file.sourceUrl,
      });
    }
  }
  const referencedFiles = new Set(entries.map((entry) => entry.filename));
  return {
    version: 1,
    policy: {
      localSources: false,
      fallbackRendering: false,
      updateEnv: "ALLOW_FONT_MANIFEST_UPDATE=1",
    },
    files: Array.from(filesByFilename.values())
      .filter((file) => referencedFiles.has(file.filename))
      .map(({
        filename,
        sourceUrl,
        sha256,
        bytes,
        sourceSha256,
        sourceBytes,
        conversion,
      }) => ({
        filename,
        sourceUrl,
        sha256,
        bytes,
        ...(sourceSha256 ? { sourceSha256, sourceBytes, conversion } : {}),
      }))
      .sort((a, b) => a.filename.localeCompare(b.filename)),
    faces: entries.sort((a, b) =>
      `${a.family}:${a.weight}:${a.style}:${a.filename}`.localeCompare(`${b.family}:${b.weight}:${b.style}:${b.filename}`),
    ),
  };
}

function mergeManifests(current, added) {
  const files = new Map(current.files.map((file) => [file.filename, file]));
  for (const file of added.files) files.set(file.filename, file);

  return {
    ...current,
    files: Array.from(files.values()).sort((a, b) => a.filename.localeCompare(b.filename)),
    faces: [...current.faces, ...added.faces].sort((a, b) =>
      `${a.family}:${a.weight}:${a.style}:${a.filename}`.localeCompare(
        `${b.family}:${b.weight}:${b.style}:${b.filename}`,
      ),
    ),
  };
}

async function writePinnedManifest(manifestPath, manifest) {
  const next = `${JSON.stringify(manifest, null, 2)}\n`;
  try {
    const current = await fs.readFile(manifestPath, "utf8");
    if (current === next) return false;
    if (process.env.ALLOW_FONT_MANIFEST_UPDATE !== "1") {
      throw new Error(
        `Font manifest drift detected at ${manifestPath}. Set ALLOW_FONT_MANIFEST_UPDATE=1 to intentionally update bundled font versions.`,
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await fs.writeFile(manifestPath, next);
  return true;
}

/** Every family in the catalog must end up with at least one face, or a consumer
 *  picking it renders nothing. Catches a typo'd family name / dead upstream URL. */
function assertEveryFamilyFrozen(catalog, manifest) {
  const frozen = new Set(manifest.faces.map((face) => face.family));
  const missing = catalog.fonts.filter((font) => !frozen.has(font.family));
  if (missing.length) {
    throw new Error(
      `Catalog families produced no font faces: ${missing.map((f) => `${f.id} (${f.family})`).join(", ")}`,
    );
  }
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(CATALOG_PATH, "utf8"));
  const conversions = new Map(
    catalog.fonts.flatMap((font) =>
      font.source.type === "files"
        ? font.source.files
            .filter((file) => file.convert)
            .map((file) => [file.url, file.convert])
        : [],
    ),
  );
  const fontsDir = path.join(BUNDLE_DIR, "fonts");
  const nextFontsDir = path.join(BUNDLE_DIR, `.fonts-next-${process.pid}`);
  const manifestPath = path.join(BUNDLE_DIR, "font-manifest.json");
  const currentManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const newFontsOnly = process.env.FREEZE_NEW_FONTS_ONLY === "1";
  const selectedFamilies = new Set(
    (process.env.FREEZE_FAMILIES ?? "").split(",").map((family) => family.trim()).filter(Boolean),
  );
  const frozenFamilies = new Set(currentManifest.faces.map((face) => face.family));
  const sourceCatalog = {
    ...catalog,
    fonts: selectedFamilies.size > 0
      ? catalog.fonts.filter((font) => selectedFamilies.has(font.family))
      : newFontsOnly
        ? catalog.fonts.filter((font) => !frozenFamilies.has(font.family))
        : catalog.fonts,
  };
  if (selectedFamilies.size > 0 && sourceCatalog.fonts.length !== selectedFamilies.size) {
    const found = new Set(sourceCatalog.fonts.map((font) => font.family));
    const missing = [...selectedFamilies].filter((family) => !found.has(family));
    throw new Error(`Unknown FREEZE_FAMILIES: ${missing.join(", ")}`);
  }
  const retainedFaces = selectedFamilies.size > 0
    ? currentManifest.faces.filter((face) => !selectedFamilies.has(face.family))
    : currentManifest.faces;
  const retainedFiles = new Set(retainedFaces.map((face) => face.filename));
  const baseManifest = selectedFamilies.size > 0
    ? {
        ...currentManifest,
        files: currentManifest.files.filter((file) => retainedFiles.has(file.filename)),
        faces: retainedFaces,
      }
    : currentManifest;
  await fs.rm(nextFontsDir, { recursive: true, force: true });
  const cache = await seedFrozenCache(manifestPath, fontsDir, nextFontsDir);

  try {
    const sources = await collectSources(sourceCatalog);
    const chunks = [];
    for (const { css, baseUrl } of sources) {
      chunks.push(await localizeFontUrls(css, baseUrl, cache, nextFontsDir, conversions));
    }
    const css = chunks.join("\n\n");

    const addedManifest = parseFontFaceManifest(css, cache);
    const manifest = newFontsOnly || selectedFamilies.size > 0
      ? mergeManifests(baseManifest, addedManifest)
      : addedManifest;
    assertEveryFamilyFrozen(catalog, manifest);
    const referenced = new Set(manifest.files.map((file) => file.filename));
    for (const filename of await fs.readdir(nextFontsDir)) {
      if (!referenced.has(filename)) await fs.rm(path.join(nextFontsDir, filename));
    }
    await writePinnedManifest(manifestPath, manifest);
    await replaceDirectory(fontsDir, nextFontsDir);

    const totalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
    console.log(
      `[konva] froze ${catalog.fonts.length} families: ${manifest.files.length} files, ` +
        `${manifest.faces.length} faces, ${Math.round(totalBytes / 1024 / 1024)} MiB -> ${fontsDir}`,
    );
  } finally {
    await fs.rm(nextFontsDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
