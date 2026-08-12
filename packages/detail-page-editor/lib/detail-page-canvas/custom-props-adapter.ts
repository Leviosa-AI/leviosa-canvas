/**
 * 문서를 싣고 내릴 때 앱이 하는 손질 두 가지. **렌더러의 일이 아니다.**
 *
 * 이 파일은 원래 Canvas 어댑터였다 — SDK가 못 읽는 `custom.*` 장식(그라데이션·그림자)을
 * 대표 단색으로 낮춰 주고, 사진 액자를 요소 상자를 옮겨 흉내 내고, 인라인 런 간격을
 * 마운트된 Konva 노드로 다시 재던 층. SDK가 사라지면서 그 셋(`adaptLeviosaCustomProps`
 * `applyCoverCropToImages` `applyRunReflow`)도 같이 사라졌다. 우리 렌더러는 원본 필드를
 * 그대로 읽고(`leviosa-canvas/render/attrs.ts`), 액자는 그리는 자리에서 잡는다
 * (`render/image-frame.ts`).
 *
 * 남은 둘은 엔진과 무관하게 **앱이 해야 하는 일**이다.
 *
 * * `applyTextLineFit` — 디컴포저가 몇 px 좁게 잰 텍스트 상자를 실제 글꼴로 다시 재
 *   그만큼만 넓힌다. 글꼴이 다 온 뒤에 돌아야 한다.
 * * `clearPlaceholderImageSrc` — 저장할 때 자리표시자 src 를 `""` 로 되돌린다.
 */

type UnknownRecord = Record<string, unknown>;

/**
 * Transparent 1x1 image used for image slots that have no source yet — a
 * transparent pixel lets the decorative background behind the slot (e.g. the
 * hero's radial gradient) show through, matching the decomposer output. The
 * element stays a real ``image`` so it remains selectable/transformable and an
 * AI-generated image drops in by simply replacing ``src``.
 * ``clearPlaceholderImageSrc`` reverts it to ``""`` on save so the placeholder
 * is never persisted.
 */
export const EMPTY_IMAGE_PLACEHOLDER_SRC =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Pull the URL out of a CSS ``background-image`` value like
 * ``url("/x/y.png")``. The decomposer stores each slot's *mockup* image there
 * (``custom.placeholderBgImage``); a plain gradient (``linear-gradient(...)``)
 * has no URL and returns null. Quotes are optional per the CSS grammar.
 */
function extractCssUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/url\(\s*(['"]?)([^'")]+)\1\s*\)/i);
  return match ? match[2].trim() || null : null;
}

/**
 * Resolve the decomposer's ``lineHeight`` — a CSS px string ("36.1px"), a
 * unitless ratio ("1.9" / 1.9), an absolute-px number (36.1), or absent — to a
 * unitless ratio for the given font size. Falls back to 1.2 (the canvas
 * default) when it cannot be parsed. A value < 4 is treated as an existing
 * ratio; anything larger is an absolute pixel height divided back to a ratio.
 */
function resolveLineHeightRatio(raw: unknown, fontSize: number): number {
  const fs = fontSize > 0 ? fontSize : 1;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw < 4 ? raw : raw / fs;
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    const value = parseFloat(s);
    if (Number.isFinite(value) && value > 0) {
      return s.endsWith("px") || value >= 4 ? value / fs : value;
    }
  }
  return 1.2;
}

/**
 * Widest rendered line of a text element, in pixels, for the element's font.
 * Returns 0 when no canvas is available (SSR / jsdom) so callers leave the box
 * untouched. Over-estimates harmlessly when the font has not loaded yet — a
 * wider box still left-aligns the same text, it just never wraps.
 */
function measureTextLineWidth(element: UnknownRecord): number {
  if (typeof document === "undefined") return 0;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return 0;
  const fontSize = Number(element.fontSize) || 0;
  if (fontSize <= 0) return 0;
  const weight = String(element.fontWeight ?? "normal");
  const family = String(element.fontFamily ?? "sans-serif");
  ctx.font = `${weight} ${fontSize}px "${family}"`;
  // 캔버스가 letterSpacing 을 EM 비율로 그리는 것에 맞춘다
  // (letterSpacing * fontSize px). The decomposer already sized the box WITH the
  // source 자간, so measuring WITHOUT it over-estimates and widens the box
  // needlessly — which, for centred colour-split fragments, shoves the text into
  // its neighbour ("만족도" over "100%"). Apply the same spacing so ``needed``
  // matches what actually renders.
  const letterSpacingEm = Number(element.letterSpacing) || 0;
  const ctxWithSpacing = ctx as CanvasRenderingContext2D & {
    letterSpacing?: string;
  };
  if (letterSpacingEm && "letterSpacing" in ctxWithSpacing) {
    ctxWithSpacing.letterSpacing = `${letterSpacingEm * fontSize}px`;
  }
  let widest = 0;
  for (const line of String(element.text ?? "").split("\n")) {
    widest = Math.max(widest, ctx.measureText(line).width);
  }
  // A touch of slack absorbs metric drift between measurement and render.
  return widest > 0 ? Math.ceil(widest + fontSize * 0.15) : 0;
}

/** 문서를 훑어 자리표시자 image src 를 빈 값으로 되돌린다. */
export function clearPlaceholderImageSrc<T>(json: T): T {
  const clone = JSON.parse(JSON.stringify(json ?? {})) as UnknownRecord;
  const visit = (element: UnknownRecord) => {
    if (element.type === "image") {
      // Revert both the transparent placeholder and a promoted mockup image
      // (older documents carry the slot's own placeholderBgImage as the preview
      // src) so an unfilled slot never persists a src.
      const mockup = extractCssUrl(asRecord(element.custom).placeholderBgImage);
      if (
        element.src === EMPTY_IMAGE_PLACEHOLDER_SRC ||
        (mockup !== null && element.src === mockup)
      ) {
        element.src = "";
      }
    }
    for (const child of asArray(element.children)) visit(asRecord(child));
  };
  for (const page of asArray(clone.pages)) {
    for (const child of asArray(asRecord(page).children)) visit(asRecord(child));
  }
  return clone as unknown as T;
}

type StoreTextElement = {
  type?: string;
  text?: string;
  x?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  align?: string;
  children?: unknown[];
  set?: (props: Record<string, number>) => void;
};

/**
 * Widen text boxes that wrap by a hair, measuring with the *loaded* webfont.
 *
 * The decomposer sizes each text box from getBoundingClientRect in its own
 * headless Chromium, but the editor's self-hosted Pretendard has slightly
 * different metrics — a line the decomposer measured at 254px renders at 256px,
 * 2px past the box, so the canvas wraps an explicit line onto a second row (the
 * chat bubbles pile up an extra line and spill out of the bubble). This must run
 * against the live store *after* ``document.fonts.ready`` — measuring against the
 * fallback face over-estimates past the drift cap and skips the fix entirely.
 *
 * Only a small overflow is corrected (drift, not a genuine wrap). Each
 * decomposer text carries explicit ``\n`` at the source's own line breaks, so a
 * widest-line overflow of a few px means the box is a touch too tight; a large
 * overflow would mean the text is a flowing paragraph meant to wrap, which is
 * left alone. Widening keeps the visual anchor: a centred box grows
 * symmetrically, a right-aligned box leftward. Idempotent — a box already wide
 * enough is untouched.
 */
export function applyTextLineFit(store: unknown): void {
  const storeRecord = asRecord(store);
  const visit = (element: StoreTextElement) => {
    if (element.type === "text" && typeof element.set === "function") {
      const width = Number(element.width) || 0;
      const fontSize = Number(element.fontSize) || 0;
      // A FLOWING paragraph — no explicit line breaks and a box taller than one
      // line — is meant to WRAP to its width. measureTextLineWidth measures its
      // whole text as a single line, so a SHORT paragraph that almost fits one
      // line reports an overflow UNDER the cap below; widening it then collapses
      // the intended two-line wrap into one line that runs off the section (the
      // FAQ answers / warranty note overflowing). The cap alone can't tell this
      // apart from a genuine hard-line that drifted a few px, so skip flowing
      // paragraphs outright — only hard "\n" lines and genuinely single-line
      // boxes get the sub-cap drift correction.
      const text = String(element.text ?? "");
      const height = Number(element.height) || 0;
      const lineRatio = resolveLineHeightRatio(
        (element as UnknownRecord).lineHeight,
        fontSize,
      );
      const flowingWrap =
        !text.includes("\n") &&
        fontSize > 0 &&
        height > fontSize * lineRatio * 1.6;
      if (width > 0 && fontSize > 0 && !flowingWrap) {
        const needed = measureTextLineWidth(element as UnknownRecord);
        const grow = needed - width;
        // Cap the correction so a genuine wrap-paragraph (stored as one long
        // line) is never unwrapped into a page-overflowing single line.
        const maxGrow = Math.max(fontSize * 1.5, width * 0.08);
        if (grow > 0 && grow <= maxGrow) {
          const align = String(element.align ?? "left");
          const patch: Record<string, number> = { width: needed };
          if (align === "center") {
            patch.x = (Number(element.x) || 0) - grow / 2;
          } else if (align === "right" || align === "end") {
            patch.x = (Number(element.x) || 0) - grow;
          }
          element.set?.(patch);
        }
      }
    }
    for (const child of asArray(element.children)) {
      visit(asRecord(child) as StoreTextElement);
    }
  };
  for (const page of asArray(storeRecord.pages)) {
    for (const child of asArray(asRecord(page).children)) {
      visit(asRecord(child) as StoreTextElement);
    }
  }
}
