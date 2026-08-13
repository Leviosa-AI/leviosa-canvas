import {
  linearGradientKonvaProps,
  parseCssGradient,
  radialGradientKonvaProps,
} from "@leviosa-ai/canvas/paint/konva-fallback";
import {
  documentWidth,
  pageHeight,
  selectPages,
  type ExportDocument,
  type ExportElement,
  type ExportPage,
} from "./document-model";
import { isItalic, layoutText, normalizeFontWeight, transformText } from "./text-layout";

/**
 * Serializes a Canvas document to Figma-compatible SVG. Figma's SVG importer
 * keeps ``<text>`` as editable text layers, ``<g>`` as groups and vector
 * shapes as vector layers, so this is the practical "Figma export": the .fig
 * format itself is a proprietary binary no third-party tool can write.
 *
 * Import-fidelity choices:
 * - Text is laid out into explicit per-line ``<tspan>``s using the same
 *   layout as the PSD/canvas exporters, so line breaks match the editor.
 * - Gradients use ``userSpaceOnUse`` with the exact geometry Konva paints.
 * - ``svg``-type elements (decomposer icons carried as data URIs) are inlined
 *   as nested ``<svg>`` so they stay vector in Figma instead of rasterizing.
 */

export type BuildSvgOptions = {
  /** Measures ``text`` in the element's font (canvas in browser, stub in tests). */
  measure: (el: ExportElement, text: string) => number;
  /** Maps an image src to an embeddable href (data URI); default: identity. */
  hrefFor?: (src: string) => string;
  /** Export only these page ids; default all pages. */
  pageIds?: string[];
};

type SvgEnv = {
  measure: BuildSvgOptions["measure"];
  hrefFor: (src: string) => string;
  defs: string[];
  nextId: () => string;
};

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Compact fixed-point formatting keeps 16-page files small. */
function fmt(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function attrs(pairs: Record<string, string | number | undefined>): string {
  return Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}="${typeof v === "number" ? fmt(v) : escapeXml(String(v))}"`)
    .join(" ");
}

function makeEnv(opts: BuildSvgOptions): SvgEnv {
  let counter = 0;
  return {
    measure: opts.measure,
    hrefFor: opts.hrefFor ?? ((src) => src),
    defs: [],
    nextId: () => `lv${counter++}`,
  };
}

function wrapSvg(width: number, height: number, env: SvgEnv, body: string): string {
  const defs = env.defs.length ? `\n<defs>\n${env.defs.join("\n")}\n</defs>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}" ` +
    `viewBox="0 0 ${fmt(width)} ${fmt(height)}">${defs}\n${body}\n</svg>`
  );
}

/** One standalone SVG per selected page, in document order. */
export function buildSvgPages(doc: ExportDocument, opts: BuildSvgOptions): string[] {
  const width = documentWidth(doc);
  return selectPages(doc, opts.pageIds).map((page, i) => {
    const env = makeEnv(opts);
    const body = pageMarkup(page, doc, env, 0, i + 1);
    return wrapSvg(width, pageHeight(page, doc), env, body);
  });
}

/** All selected pages stacked vertically in a single SVG. */
export function buildSvgDocument(doc: ExportDocument, opts: BuildSvgOptions): string {
  const pages = selectPages(doc, opts.pageIds);
  const width = documentWidth(doc);
  const totalHeight = pages.reduce((acc, p) => acc + pageHeight(p, doc), 0);
  const env = makeEnv(opts);
  const parts: string[] = [];
  let dy = 0;
  pages.forEach((page, i) => {
    parts.push(pageMarkup(page, doc, env, dy, i + 1));
    dy += pageHeight(page, doc);
  });
  return wrapSvg(width, totalHeight, env, parts.join("\n"));
}

function pageMarkup(
  page: ExportPage,
  doc: ExportDocument,
  env: SvgEnv,
  dy: number,
  index: number,
): string {
  const width = documentWidth(doc);
  const height = pageHeight(page, doc);
  const parts: string[] = [];

  const bg = page.background;
  if (typeof bg === "string" && bg && bg !== "transparent") {
    const gradient = parseCssGradient(bg);
    const fill = gradient ? gradientRef(gradient, 0, 0, width, height, env) : bg;
    parts.push(`<rect ${attrs({ width, height, fill })}/>`);
  }
  parts.push(...childrenMarkup(page.children ?? [], env));

  const name = `p${String(index).padStart(2, "0")} ${page.name || page.id || ""}`.trim();
  const transform = dy ? ` transform="translate(0 ${fmt(dy)})"` : "";
  return `<g id="${escapeXml(name)}"${transform}>\n${parts.join("\n")}\n</g>`;
}

function elementMarkup(el: ExportElement, env: SvgEnv): string | null {
  if (el.visible === false) return null;
  if (el.type === "group") {
    // 체크리스트 행처럼 런들이 그룹 안에 들어 있는 경우가 많다 — 여기서도 줄로 묶는다.
    const inner = childrenMarkup(
      (el.children ?? []).filter((child) => child.visible !== false),
      env,
    ).join("\n");
    if (!inner) return null;
    return `<g ${attrs({ id: el.name || el.id, opacity: opacityAttr(el) })}>\n${inner}\n</g>`;
  }
  if (el.type === "text") return textMarkup(el, env);
  if (el.type === "figure") return figureMarkup(el, env);
  if (el.type === "svg") return inlineSvgMarkup(el) ?? imageMarkup(el, env);
  if (el.type === "image") return imageMarkup(el, env);
  return null;
}

function opacityAttr(el: ExportElement): number | undefined {
  const opacity = num(el.opacity, 1);
  return opacity < 1 ? opacity : undefined;
}

/**
 * Gradient fill for a box at absolute (x, y): registers a def and returns the
 * ``url(#id)`` reference. userSpaceOnUse keeps the CSS/Konva geometry exact.
 */
function gradientRef(
  gradient: NonNullable<ReturnType<typeof parseCssGradient>>,
  x: number,
  y: number,
  w: number,
  h: number,
  env: SvgEnv,
): string {
  const id = env.nextId();
  const stops = gradient.stops
    .map(
      (s) =>
        `<stop offset="${fmt(Math.min(1, Math.max(0, s.offset)))}" stop-color="${escapeXml(s.color)}"/>`,
    )
    .join("");
  if (gradient.type === "radial") {
    const p = radialGradientKonvaProps(gradient, w, h);
    env.defs.push(
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
        `cx="${fmt(x + p.fillRadialGradientEndPoint.x)}" cy="${fmt(y + p.fillRadialGradientEndPoint.y)}" ` +
        `r="${fmt(p.fillRadialGradientEndRadius)}">${stops}</radialGradient>`,
    );
  } else {
    const p = linearGradientKonvaProps(gradient, w, h);
    env.defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
        `x1="${fmt(x + p.fillLinearGradientStartPoint.x)}" y1="${fmt(y + p.fillLinearGradientStartPoint.y)}" ` +
        `x2="${fmt(x + p.fillLinearGradientEndPoint.x)}" y2="${fmt(y + p.fillLinearGradientEndPoint.y)}">` +
        `${stops}</linearGradient>`,
    );
  }
  return `url(#${id})`;
}

function figureMarkup(el: ExportElement, env: SvgEnv): string {
  const x = num(el.x);
  const y = num(el.y);
  const w = num(el.width);
  const h = num(el.height);
  const gradient = parseCssGradient(el.fill) ?? parseCssGradient(el.custom?.gradient);
  const fill = gradient
    ? gradientRef(gradient, x, y, w, h, env)
    : el.fill && el.fill !== "transparent"
      ? el.fill
      : "none";
  const strokeWidth = num(el.strokeWidth);
  const common = {
    id: el.name || el.id,
    fill,
    opacity: opacityAttr(el),
    ...(el.stroke && strokeWidth > 0
      ? { stroke: el.stroke, "stroke-width": strokeWidth }
      : {}),
  };
  if (el.subType === "circle" || el.subType === "ellipse") {
    return `<ellipse ${attrs({ cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, ...common })}/>`;
  }
  const r = Math.max(0, Math.min(num(el.cornerRadius), w / 2, h / 2));
  return `<rect ${attrs({ x, y, width: w, height: h, ...(r ? { rx: r } : {}), ...common })}/>`;
}

function textMarkup(el: ExportElement, env: SvgEnv): string {
  const x = num(el.x);
  const y = num(el.y);
  const w = num(el.width);
  const fontSize = num(el.fontSize, 16);
  const layout = layoutText(el, (s) => env.measure(el, s));
  const align = el.align === "center" || el.align === "right" ? el.align : "left";
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  const ax = align === "center" ? x + w / 2 : align === "right" ? x + w : x;

  // Match canvas textBaseline='middle': the baseline sits ~0.35em below the
  // vertical center of the line box (kept renderer-independent on purpose —
  // Figma's importer ignores dominant-baseline).
  const tspans = layout.lines
    .map((line, i) => {
      const lineY = y + layout.offsetY + i * layout.leading + layout.leading / 2 + fontSize * 0.35;
      return `<tspan x="${fmt(ax / layout.scaleX)}" y="${fmt(lineY)}">${escapeXml(line) || " "}</tspan>`;
    })
    .join("");

  // 스톡 편집기의 letterSpacing은 em이다(Konva에는 letterSpacing * fontSize로 넘어간다).
  // 숫자를 그대로 쓰면 SVG는 px로 읽어 자간이 사실상 0이 되고, 글자가 편집기보다 넓어진다.
  const letterSpacing = num(el.letterSpacing) * fontSize;
  return `<text ${attrs({
    id: el.name || el.id,
    "font-family": el.fontFamily || "Pretendard",
    "font-size": fontSize,
    "font-weight": normalizeFontWeight(el),
    ...(isItalic(el) ? { "font-style": "italic" } : {}),
    fill: el.fill || "#000",
    opacity: opacityAttr(el),
    ...(letterSpacing ? { "letter-spacing": letterSpacing } : {}),
    ...(el.textDecoration === "line-through" || el.textDecoration === "underline"
      ? { "text-decoration": el.textDecoration }
      : {}),
    "text-anchor": anchor,
    ...(layout.scaleX < 1 ? { transform: `scale(${fmt(layout.scaleX)} 1)` } : {}),
  })}>${tspans}</text>`;
}

/**
 * 한 줄을 이루는 텍스트 런들을 하나의 ``<text>``로 흘려보낸다.
 *
 * 디컴포저는 "흡수가 **빠른** 콜로이드 미네랄"처럼 굵기·색이 섞인 한 줄을 런마다
 * 별개 요소로 쪼개고, 런 사이의 공백은 **절대 x 좌표의 여백**으로만 남긴다. 편집기(Konva)는
 * 우리가 재둔 폰트로 그리니 그 여백이 정확히 맞지만, 여유는 5~6px뿐이다. SVG를 다른 도구가
 * 열면(피그마가 폰트를 대체하거나 letter-spacing을 무시하면) 글자가 그만큼만 넓어져도
 * 여백이 통째로 먹히고 런끼리 붙어 버린다 — 절대 좌표로 붙여 놓은 줄은 폰트가 바뀌는 순간
 * 반드시 깨진다.
 *
 * 그래서 한 줄은 한 ``<text>``로 만들고, 런은 ``<tspan>``으로 **흘린다**. 간격은 좌표가 아니라
 * 진짜 공백 문자가 만든다 → 어떤 폰트로 열어도 간격이 살아 있고, 피그마에는 굵기가 섞인
 * 텍스트 레이어 하나로 들어온다(원래 그렇게 편집돼야 하는 물건이다).
 */
const RUN_GAP_SPACE = 0.2; // em. 이 이상 벌어져 있으면 원래 공백이 있던 자리다.
const RUN_GAP_MAX = 1.6; // em. 이보다 멀면 같은 줄의 이웃 런이 아니라 딴 물건이다.

/** 글자가 실제로 앉는 선. 크기가 다른 런(각주 "[*고장성 온천]")도 이 선이 같으면 한 줄이다. */
function baselineOf(el: ExportElement, env: SvgEnv): number {
  const fontSize = num(el.fontSize, 16);
  const layout = layoutText(el, (s) => env.measure(el, s));
  return num(el.y) + layout.offsetY + layout.leading / 2 + fontSize * 0.35;
}

function sameLineRun(a: ExportElement, b: ExportElement, env: SvgEnv): boolean {
  if (a.type !== "text" || b.type !== "text") return false;
  if (b.visible === false || a.visible === false) return false;
  const fs = num(a.fontSize, 16);
  // 같은 줄인지는 박스 y가 아니라 '글자가 앉는 선'으로 본다. 그래야 작은 각주 런도 같이
  // 흐르고, 위로 띄운 첨자(sup)는 선이 다르니 제 자리에 남는다.
  if (Math.abs(baselineOf(a, env) - baselineOf(b, env)) > 0.3 * fs) return false;
  if ((a.fontFamily || "") !== (b.fontFamily || "")) return false;
  if (num(a.rotation) || num(b.rotation)) return false;
  if (num(a.opacity, 1) !== num(b.opacity, 1)) return false;
  // 흐르게 하려면 둘 다 왼쪽 기준이어야 한다(가운데/오른쪽 정렬 런은 앵커가 다르다).
  const leftAligned = (el: ExportElement) => el.align !== "center" && el.align !== "right";
  if (!leftAligned(a) || !leftAligned(b)) return false;
  if (String(a.text ?? "").includes("\n") || String(b.text ?? "").includes("\n")) return false;
  const gap = runGap(a, b, env);
  // 박스가 잉크보다 넓어 gap이 살짝 음수로 나오기도 한다(-0.25em까지는 이웃으로 본다).
  return gap > -0.25 * fs && gap < RUN_GAP_MAX * fs;
}

/**
 * 두 런 사이의 실제 빈 공간.
 *
 * 요소의 width(박스)가 아니라 **글자 폭**으로 잰다. 디컴포저의 박스는 잉크보다 몇 px 넓어서
 * (예: "흡수가" 잉크 68.5px, 박스 72px) 박스로 재면 원래 있던 공백 한 칸(≈6.5px)이 3px로
 * 줄어들어 '공백 없음'으로 오판된다 — 그러면 합쳐진 줄이 "흡수가빠른"으로 붙어 버린다.
 */
function runGap(a: ExportElement, b: ExportElement, env: SvgEnv): number {
  const inkWidth = env.measure(a, transformText(a));
  return num(b.x) - (num(a.x) + inkWidth);
}

function textRunLineMarkup(runs: ExportElement[], env: SvgEnv): string {
  const first = runs[0];
  const fontSize = num(first.fontSize, 16);
  const layout = layoutText(first, (s) => env.measure(first, s));
  const baseline =
    num(first.y) + layout.offsetY + layout.leading / 2 + fontSize * 0.35;

  const tspans = runs
    .map((run, i) => {
      const gap = i === 0 ? 0 : runGap(runs[i - 1], run, env);
      // 공백 한 칸의 폭은 작은 쪽 글자 기준이다 — 큰 글자 기준으로 재면 각주 앞의
      // 공백("함량 [*고장성 온천]")이 '공백 없음'으로 잘린다.
      const scale = i === 0 ? fontSize : Math.min(fontSize, num(run.fontSize, 16));
      const lead = i > 0 && gap >= RUN_GAP_SPACE * scale ? " " : "";
      const weight = normalizeFontWeight(run);
      const fill = run.fill || "#000";
      const size = num(run.fontSize, 16);
      return `<tspan ${attrs({
        ...(weight !== normalizeFontWeight(first) ? { "font-weight": weight } : {}),
        ...(fill !== (first.fill || "#000") ? { fill } : {}),
        ...(Math.abs(size - fontSize) > 0.5 ? { "font-size": size } : {}),
        ...(isItalic(run) && !isItalic(first) ? { "font-style": "italic" } : {}),
      })}>${escapeXml(lead + transformText(run))}</tspan>`;
    })
    .join("");

  const letterSpacing = num(first.letterSpacing) * fontSize; // 스톡 편집기의 letterSpacing은 em
  return `<text ${attrs({
    id: first.name || first.id,
    "font-family": first.fontFamily || "Pretendard",
    "font-size": fontSize,
    "font-weight": normalizeFontWeight(first),
    ...(isItalic(first) ? { "font-style": "italic" } : {}),
    fill: first.fill || "#000",
    opacity: opacityAttr(first),
    ...(letterSpacing ? { "letter-spacing": letterSpacing } : {}),
    "text-anchor": "start",
    x: num(first.x),
    y: baseline,
    // 런 사이의 공백은 이 줄의 유일한 간격 장치다 — 기본 규칙대로면 공백이 접히거나 잘린다.
    "xml:space": "preserve",
  })}>${tspans}</text>`;
}

/** 자식들을 순회하되, 한 줄을 이루는 텍스트 런들은 하나의 <text>로 묶어 낸다. */
function childrenMarkup(children: ExportElement[], env: SvgEnv): string[] {
  const parts: string[] = [];
  for (let i = 0; i < children.length; i++) {
    const run: ExportElement[] = [children[i]];
    while (i + 1 < children.length && sameLineRun(children[i], children[i + 1], env)) {
      run.push(children[++i]);
    }
    if (run.length > 1) {
      parts.push(textRunLineMarkup(run, env));
      continue;
    }
    const markup = elementMarkup(children[i], env);
    if (markup) parts.push(markup);
  }
  return parts;
}

const FIT_TO_PRESERVE: Record<string, string> = {
  cover: "xMidYMid slice",
  contain: "xMidYMid meet",
  fill: "none",
};

function imageMarkup(el: ExportElement, env: SvgEnv): string | null {
  const src = String(el.src ?? "");
  if (!src) return null;
  const x = num(el.x);
  const y = num(el.y);
  const w = num(el.width);
  const h = num(el.height);
  const r = Math.max(0, Math.min(num(el.cornerRadius), w / 2, h / 2));
  let clip: string | undefined;
  if (r > 0) {
    const id = env.nextId();
    env.defs.push(
      `<clipPath id="${id}"><rect ${attrs({ x, y, width: w, height: h, rx: r })}/></clipPath>`,
    );
    clip = `url(#${id})`;
  }
  const fit = String(el.custom?.objectFit ?? "cover");
  return `<image ${attrs({
    id: el.name || el.id,
    href: env.hrefFor(src),
    x,
    y,
    width: w,
    height: h,
    preserveAspectRatio: FIT_TO_PRESERVE[fit] ?? FIT_TO_PRESERVE.cover,
    opacity: opacityAttr(el),
    ...(clip ? { "clip-path": clip } : {}),
  })}/>`;
}

/**
 * Encode SVG markup into a ``data:image/svg+xml;base64`` URI (UTF-8 safe).
 * Canvas ``svg``-type elements carry their markup in ``src`` this way; this is
 * the inverse of {@link decodeSvgDataUri} and matches the bubble-tail encoder.
 */
export function encodeSvgDataUri(markup: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(markup)))}`;
}

/** Decode a data:image/svg+xml URI into its markup, or null. */
export function decodeSvgDataUri(src: string): string | null {
  const m = src.match(/^data:image\/svg\+xml(;charset=[^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!m) return null;
  try {
    return m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  } catch {
    return null;
  }
}

/**
 * Inline an ``svg``-type element as a nested ``<svg>`` positioned in the page.
 * Returns null when the source is not decodable inline SVG — the caller then
 * falls back to an ``<image>`` reference.
 */
function inlineSvgMarkup(el: ExportElement): string | null {
  const markup = decodeSvgDataUri(String(el.src ?? ""));
  if (!markup) return null;
  const rootMatch = markup.match(/<svg\b[^>]*>/i);
  if (!rootMatch) return null;

  const rootTag = rootMatch[0];
  const readAttr = (name: string): string | null => {
    const am = rootTag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
    return am ? am[1] : null;
  };
  let viewBox = readAttr("viewBox");
  if (!viewBox) {
    const iw = parseFloat(readAttr("width") ?? "");
    const ih = parseFloat(readAttr("height") ?? "");
    if (!Number.isFinite(iw) || !Number.isFinite(ih) || iw <= 0 || ih <= 0) return null;
    viewBox = `0 0 ${iw} ${ih}`;
  }

  const inner = markup.slice(markup.indexOf(rootTag) + rootTag.length);
  const closing = inner.lastIndexOf("</svg>");
  if (closing < 0) return null;
  const fit = String(el.custom?.objectFit ?? "contain");
  const open = `<svg ${attrs({
    id: el.name || el.id,
    x: num(el.x),
    y: num(el.y),
    width: num(el.width),
    height: num(el.height),
    viewBox,
    preserveAspectRatio: FIT_TO_PRESERVE[fit] ?? FIT_TO_PRESERVE.contain,
    opacity: opacityAttr(el),
  })}>`;
  return `${open}${inner.slice(0, closing)}</svg>`;
}
