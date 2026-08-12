/**
 * 서식 복사·붙이기(Canva의 "서식 붓").
 *
 * 상세페이지는 **같은 톤의 소제목이 20섹션 반복되는 문서**다. 하나를 다듬어 놓고
 * 나머지에 같은 폰트·크기·색·자간·하이라이트를 먹이려면 지금은 인스펙터에서 값을
 * 하나씩 다시 맞춰야 한다.
 *
 * 스톡 편집기의 ``useCopyStyle``을 안 쓰는 이유가 셋 있다.
 *
 * 1. 공통 필드에 ``width``·``height``가 들어 있어, 같은 타입끼리 붙이면 **크기까지
 *    바뀐다**. Canva의 서식 붓은 크기를 안 건드린다.
 * 2. 타입별 필드 표에 ``group``이 없다. ``intersect(map[a.type], map[b.type])``에
 *    undefined가 들어가 그룹(=우리 문서의 대부분)에 대고 쓰면 터진다.
 * 3. 발동 조건이 ``selectedElements[0]`` 변화 감지라, 우리 드릴인·다중선택과 섞이면
 *    예측이 안 된다. 여기서는 복사·붙이기 두 동작만 둔다.
 */

/** 타입이 무엇이든 옮겨도 되는 것 — 크기·좌표·내용은 하나도 없다. */
const COMMON = [
  "opacity",
  "blurEnabled",
  "blurRadius",
  "shadowEnabled",
  "shadowBlur",
  "shadowColor",
  "shadowOffsetX",
  "shadowOffsetY",
] as const;

/**
 * 타입별로 옮길 서식.
 *
 * ``fontSize``는 **넣는다** — 소제목 20개의 크기를 맞추는 게 이 기능의 알맹이다.
 * 상자(``width``/``height``)는 안 건드리므로 글자만 커진다.
 * ``crop*``은 **뺀다** — 어디를 잘라 보여줄지는 서식이 아니라 내용이다.
 */
const BY_TYPE: Record<string, ReadonlyArray<string>> = {
  text: [
    ...COMMON,
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "lineHeight",
    "letterSpacing",
    "align",
    "verticalAlign",
    "textDecoration",
    "fill",
    "stroke",
    "strokeWidth",
    "backgroundEnabled",
    "backgroundColor",
    "backgroundOpacity",
    "backgroundCornerRadius",
    "backgroundPadding",
  ],
  figure: [...COMMON, "fill", "stroke", "strokeWidth", "dash", "cornerRadius"],
  svg: [...COMMON, "colorsReplace", "borderColor", "borderSize", "cornerRadius"],
  image: [...COMMON, "borderColor", "borderSize", "cornerRadius"],
};

/**
 * 서식을 읽고 쓰는 데 필요한 것만. 나머지 필드는 이름으로 집으므로 열어 둔다 — 타입을
 * 좁히면 호출부(캔버스 메뉴의 요소, 테스트 픽스처)가 전부 캐스팅을 달아야 한다.
 */
export type FormatElement = {
  type?: string;
  set?: (props: Record<string, unknown>) => void;
  [key: string]: unknown;
};

export type CopiedFormat = {
  type: string;
  props: Record<string, unknown>;
};

/** 서식을 복사할 수 있는 타입인가. 그룹·차트·표는 아니다(자기 스펙이 모양을 정한다). */
export function canCopyFormat(el: FormatElement | undefined | null): boolean {
  return !!el?.type && el.type in BY_TYPE;
}

/** 배열·객체 값은 얕게 복사한다 — 원본과 같은 참조를 공유하면 한쪽을 고칠 때 둘 다 바뀐다. */
function detach(value: unknown): unknown {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === "object") return { ...(value as object) };
  return value;
}

/**
 * 요소의 서식을 떠 낸다. 값이 없는(``undefined``) 필드는 **키 자체를 안 만든다** —
 * 나중에 붙일 때 대상의 멀쩡한 값을 undefined로 뭉개지 않기 위해서다.
 */
export function copyFormat(el: FormatElement | undefined | null): CopiedFormat | null {
  if (!canCopyFormat(el)) return null;
  const type = el!.type!;
  const bag = el as Record<string, unknown>;
  const props: Record<string, unknown> = {};
  for (const key of BY_TYPE[type]) {
    const value = bag[key];
    if (value === undefined) continue;
    props[key] = detach(value);
  }
  return { type, props };
}

/**
 * 이 대상에 실제로 먹일 값. 타입이 다르면 **교집합만** 간다 — 텍스트 서식을 도형에
 * 붙이면 불투명도와 그림자만 옮는다.
 */
export function formatToApply(
  copied: CopiedFormat,
  target: FormatElement | undefined | null,
): Record<string, unknown> {
  const fields = target?.type ? BY_TYPE[target.type] : undefined;
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const key of fields) {
    if (key in copied.props) out[key] = detach(copied.props[key]);
  }
  return out;
}

/** 붙일 게 하나라도 있는가 — 메뉴 항목 비활성 판정. */
export function canPasteFormat(
  copied: CopiedFormat | null,
  targets: ReadonlyArray<FormatElement>,
): boolean {
  if (!copied || targets.length === 0) return false;
  return targets.some((el) => Object.keys(formatToApply(copied, el)).length > 0);
}

/** 선택 전부에 붙인다. 실제로 바뀐 요소 수를 돌려준다. */
export function applyFormat(
  copied: CopiedFormat,
  targets: ReadonlyArray<FormatElement>,
): number {
  let touched = 0;
  for (const el of targets) {
    const props = formatToApply(copied, el);
    if (!Object.keys(props).length) continue;
    el.set?.(props);
    touched += 1;
  }
  return touched;
}

// ── 세션 클립보드 ───────────────────────────────────────────────────────────
// 문서에 저장하지 않는다. 서식 붓은 "지금 이 작업 동안"의 도구다.

let held: CopiedFormat | null = null;

export function holdFormat(copied: CopiedFormat | null): void {
  held = copied;
}

export function heldFormat(): CopiedFormat | null {
  return held;
}
