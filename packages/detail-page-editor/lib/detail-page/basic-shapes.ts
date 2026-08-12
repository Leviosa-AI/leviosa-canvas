/**
 * 기본 도형 카탈로그 — "요소 · 도형" 그리드가 그대로 뿌리는 목록.
 *
 * **아이콘이 아니다.** 아이콘은 뜻을 나르고(트럭 = 배송), 도형은 자리를 만든다(배지 바탕,
 * 화살표 연결, 구분선). 그래서 여기 있는 것들은 검색 대상이 아니라 **한눈에 다 보이는
 * 고정 목록**이고, 뜻이 붙은 그림은 하나도 없다.
 *
 * 색은 전부 `SHAPE_FILL` 한 값으로 통일한다. 넣은 뒤 우측 인스펙터의 SVG 색 컨트롤이
 * 원본 색마다 칸을 하나씩 여는데, 도형 하나가 색을 셋씩 쓰면 그 칸이 셋이 된다 —
 * 사용자는 "이 도형 색"을 하나로 생각한다. 획을 쓰는 도형(선·괄호)도 같은 값을 쓴다.
 *
 * 좌표계는 대부분 24×24다. 가로로 긴 것(구분선·배너·쿠폰)만 자기 비율을 갖는다 —
 * 정사각 상자에 우겨넣으면 삽입 후 반드시 늘리게 되고, 그 순간 획 굵기가 찌그러진다.
 */

/** 도형 한 벌의 색. 중립 회색 — 어떤 브랜드 색과도 안 싸운다. */
export const SHAPE_FILL = "#d4d4d8";

/** 그리드를 가르는 묶음. 순서가 화면 순서다. */
export type ShapeCategory = "basic" | "arrow" | "star" | "bubble" | "nature" | "line" | "badge";

export type BasicShape = {
  /** 로케일 키(`detailPage.shapes.basic.<id>`)이자 그리드 key. */
  id: string;
  category: ShapeCategory;
  viewBox: string;
  /** `<svg>` 안에 그대로 들어갈 조각. 색은 `SHAPE_FILL`만 쓴다. */
  body: string;
};

const F = SHAPE_FILL;
/** 획으로 그리는 도형의 공통 속성. 채움 도형과 같은 색을 쓴다. */
const S = `fill="none" stroke="${F}" stroke-linecap="round" stroke-linejoin="round"`;

export const BASIC_SHAPES: readonly BasicShape[] = [
  // ── 기본 ────────────────────────────────────────────────────────────────
  {
    id: "triangle",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<polygon points="12,3 22,21 2,21" fill="${F}"/>`,
  },
  {
    id: "triangleDown",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<polygon points="2,3 22,3 12,21" fill="${F}"/>`,
  },
  {
    id: "triangleRight",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<polygon points="4,2 21,12 4,22" fill="${F}"/>`,
  },
  {
    id: "rightTriangle",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<polygon points="3,3 21,21 3,21" fill="${F}"/>`,
  },
  {
    id: "diamond",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<polygon points="12,2 22,12 12,22 2,12" fill="${F}"/>`,
  },
  {
    id: "parallelogram",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<polygon points="7,4 23,4 17,20 1,20" fill="${F}"/>`,
  },
  {
    id: "trapezoid",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<polygon points="6,4 18,4 23,20 1,20" fill="${F}"/>`,
  },
  {
    id: "pentagon",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<polygon points="12,2 21.5,8.9 17.9,20.1 6.1,20.1 2.5,8.9" fill="${F}"/>`,
  },
  {
    id: "hexagon",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<polygon points="12,2 20.7,7 20.7,17 12,22 3.3,17 3.3,7" fill="${F}"/>`,
  },
  {
    id: "hexagonFlat",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<polygon points="7,3.3 17,3.3 22,12 17,20.7 7,20.7 2,12" fill="${F}"/>`,
  },
  {
    id: "heptagon",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<polygon points="12,2 19.8,5.8 21.7,14.2 16.3,21 7.7,21 2.3,14.2 4.2,5.8" fill="${F}"/>`,
  },
  {
    id: "octagon",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<polygon points="7.5,2 16.5,2 22,7.5 22,16.5 16.5,22 7.5,22 2,16.5 2,7.5" fill="${F}"/>`,
  },
  {
    id: "semicircle",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<path d="M2 17a10 10 0 0 1 20 0z" fill="${F}"/>`,
  },
  {
    id: "quarterCircle",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<path d="M3 21V3a18 18 0 0 1 18 18z" fill="${F}"/>`,
  },
  {
    id: "ring",
    category: "basic",
    viewBox: "0 0 24 24",
    // 두 원을 한 path에 담고 evenodd로 가운데를 뚫는다. 두 요소로 나누면 색 칸이 둘이 된다.
    body: `<path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12z" fill="${F}"/>`,
  },
  {
    id: "pill",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<rect x="1" y="7" width="22" height="10" rx="5" fill="${F}"/>`,
  },
  {
    id: "cross",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<polygon points="9,2 15,2 15,9 22,9 22,15 15,15 15,22 9,22 9,15 2,15 2,9 9,9" fill="${F}"/>`,
  },
  {
    id: "frame",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<path fill-rule="evenodd" d="M2 2h20v20H2zm3 3v14h14V5z" fill="${F}"/>`,
  },
  {
    id: "frameRounded",
    category: "basic",
    viewBox: "0 0 24 24",
    body: `<path fill-rule="evenodd" d="M6 2h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4zm0 3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" fill="${F}"/>`,
  },

  // ── 화살표 ──────────────────────────────────────────────────────────────
  {
    id: "arrowRight",
    category: "arrow",
    viewBox: "0 0 24 24",
    body: `<path d="M2 9h13V4l7 8-7 8v-5H2z" fill="${F}"/>`,
  },
  {
    id: "arrowLeft",
    category: "arrow",
    viewBox: "0 0 24 24",
    body: `<path d="M22 9H9V4l-7 8 7 8v-5h13z" fill="${F}"/>`,
  },
  {
    id: "arrowUp",
    category: "arrow",
    viewBox: "0 0 24 24",
    body: `<path d="M9 22V9H4l8-7 8 7h-5v13z" fill="${F}"/>`,
  },
  {
    id: "arrowDown",
    category: "arrow",
    viewBox: "0 0 24 24",
    body: `<path d="M9 2v13H4l8 7 8-7h-5V2z" fill="${F}"/>`,
  },
  {
    id: "arrowBoth",
    category: "arrow",
    viewBox: "0 0 24 24",
    body: `<path d="M7 7v3h10V7l6 5-6 5v-3H7v3l-6-5z" fill="${F}"/>`,
  },
  {
    id: "arrowBlock",
    category: "arrow",
    viewBox: "0 0 24 24",
    body: `<path d="M2 7h11V2l9 10-9 10v-5H2z" fill="${F}"/>`,
  },
  {
    id: "arrowCorner",
    category: "arrow",
    viewBox: "0 0 24 24",
    // 세로 기둥과 가로 팔의 두께를 5로 맞춘다. 앞 판은 팔이 2밖에 안 돼서
    // 화살촉만 큰 기형이었다.
    body: `<path d="M3 3h5v10h8v-3l6 5.5-6 5.5v-3H3z" fill="${F}"/>`,
  },
  {
    id: "arrowCurve",
    category: "arrow",
    viewBox: "0 0 24 24",
    body: `<path d="M3 21v-5a7 7 0 0 1 7-7h6V4l7 7-7 7v-5h-6a2 2 0 0 0-2 2v6z" fill="${F}"/>`,
  },
  {
    id: "chevronRight",
    category: "arrow",
    viewBox: "0 0 24 24",
    body: `<path d="M8 3l9 9-9 9-3.5-3.5L10 12 4.5 6.5z" fill="${F}"/>`,
  },
  {
    id: "chevronDown",
    category: "arrow",
    viewBox: "0 0 24 24",
    body: `<path d="M21 8l-9 9-9-9 3.5-3.5L12 10l5.5-5.5z" fill="${F}"/>`,
  },
  {
    id: "arrowBanner",
    category: "arrow",
    viewBox: "0 0 48 16",
    body: `<path d="M0 0h40l8 8-8 8H0l6-8z" fill="${F}"/>`,
  },
  {
    id: "arrowThin",
    category: "arrow",
    viewBox: "0 0 24 24",
    body: `<path d="M3 12h17M14 6l6 6-6 6" ${S} stroke-width="2"/>`,
  },

  // ── 별 · 강조 ───────────────────────────────────────────────────────────
  {
    id: "star",
    category: "star",
    viewBox: "0 0 24 24",
    body: `<polygon points="12,2 15,9 22.5,9.5 16.8,14.4 18.6,21.7 12,17.7 5.4,21.7 7.2,14.4 1.5,9.5 9,9" fill="${F}"/>`,
  },
  {
    id: "star4",
    category: "star",
    viewBox: "0 0 24 24",
    body: `<polygon points="12,1 14.3,9.7 23,12 14.3,14.3 12,23 9.7,14.3 1,12 9.7,9.7" fill="${F}"/>`,
  },
  {
    id: "star6",
    category: "star",
    viewBox: "0 0 24 24",
    body: `<polygon points="12,1 14.8,7.2 21.5,6.5 17.5,12 21.5,17.5 14.8,16.8 12,23 9.2,16.8 2.5,17.5 6.5,12 2.5,6.5 9.2,7.2" fill="${F}"/>`,
  },
  {
    id: "star8",
    category: "star",
    viewBox: "0 0 24 24",
    body: `<polygon points="12,1 13.8,7.8 19.8,4.2 16.2,10.2 23,12 16.2,13.8 19.8,19.8 13.8,16.2 12,23 10.2,16.2 4.2,19.8 7.8,13.8 1,12 7.8,10.2 4.2,4.2 10.2,7.8" fill="${F}"/>`,
  },
  {
    id: "sparkle",
    category: "star",
    viewBox: "0 0 24 24",
    body: `<path d="M12 1c1 6.5 4.5 10 11 11-6.5 1-10 4.5-11 11-1-6.5-4.5-10-11-11 6.5-1 10-4.5 11-11z" fill="${F}"/>`,
  },
  {
    id: "burst",
    category: "star",
    viewBox: "0 0 24 24",
    body: `<polygon points="12,1 13.7,5.7 17.5,2.5 16.6,7.4 21.5,6.5 18.3,10.3 23,12 18.3,13.7 21.5,17.5 16.6,16.6 17.5,21.5 13.7,18.3 12,23 10.3,18.3 6.5,21.5 7.4,16.6 2.5,17.5 5.7,13.7 1,12 5.7,10.3 2.5,6.5 7.4,7.4 6.5,2.5 10.3,5.7" fill="${F}"/>`,
  },
  {
    id: "heart",
    category: "star",
    viewBox: "0 0 24 24",
    body: `<path d="M12 21.4C4.7 15.8 2 12.6 2 9.1A5.6 5.6 0 0 1 12 5.7 5.6 5.6 0 0 1 22 9.1c0 3.5-2.7 6.7-10 12.3z" fill="${F}"/>`,
  },
  {
    id: "shield",
    category: "star",
    viewBox: "0 0 24 24",
    body: `<path d="M12 2l8.5 3v6.5c0 5.3-3.6 9.6-8.5 11.5-4.9-1.9-8.5-6.2-8.5-11.5V5z" fill="${F}"/>`,
  },

  // ── 말풍선 ──────────────────────────────────────────────────────────────
  {
    id: "bubbleRect",
    category: "bubble",
    viewBox: "0 0 24 24",
    body: `<path d="M2 3h20v13h-9l-6 5v-5H2z" fill="${F}"/>`,
  },
  {
    id: "bubbleRound",
    category: "bubble",
    viewBox: "0 0 24 24",
    body: `<path d="M6 3h12a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-5l-6 4.5V17H6a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z" fill="${F}"/>`,
  },
  {
    id: "bubbleOval",
    category: "bubble",
    viewBox: "0 0 24 24",
    body: `<path d="M12 3c5.5 0 10 3.1 10 7s-4.5 7-10 7c-1.2 0-2.4-.2-3.5-.4L3 21l1.8-4.3C3 15.4 2 13.3 2 10c0-3.9 4.5-7 10-7z" fill="${F}"/>`,
  },
  {
    id: "bubbleTailLeft",
    category: "bubble",
    viewBox: "0 0 24 24",
    body: `<path d="M22 4v13H8l-6 4V4z" fill="${F}"/>`,
  },
  {
    id: "bubbleThought",
    category: "bubble",
    viewBox: "0 0 24 24",
    body: `<path d="M9 3.5a4.5 4.5 0 0 1 7.6.6A4 4 0 0 1 21 8.4a3.8 3.8 0 0 1-2.6 5.6H8.6A5.3 5.3 0 0 1 9 3.5zM6 17a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-3.2 4.2a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z" fill="${F}"/>`,
  },

  // ── 자연 ────────────────────────────────────────────────────────────────
  {
    id: "cloud",
    category: "nature",
    viewBox: "0 0 24 24",
    body: `<path d="M7 19a5 5 0 0 1 .4-10A6.6 6.6 0 0 1 19.4 11 4 4 0 0 1 19 19z" fill="${F}"/>`,
  },
  {
    id: "drop",
    category: "nature",
    viewBox: "0 0 24 24",
    body: `<path d="M12 2c4 5.4 6 9 6 11a6 6 0 1 1-12 0c0-2 2-5.6 6-11z" fill="${F}"/>`,
  },
  {
    id: "leaf",
    category: "nature",
    viewBox: "0 0 24 24",
    body: `<path d="M21 3c0 10-3 18-11 18a6 6 0 0 1-6-6C4 8 11 3 21 3z" fill="${F}"/>`,
  },
  {
    id: "bolt",
    category: "nature",
    viewBox: "0 0 24 24",
    body: `<polygon points="14,1 4,14 10,14 9,23 20,10 13,10" fill="${F}"/>`,
  },
  {
    id: "moon",
    category: "nature",
    viewBox: "0 0 24 24",
    body: `<path d="M20.5 15.5A9.5 9.5 0 0 1 8.5 3.5a9.5 9.5 0 1 0 12 12z" fill="${F}"/>`,
  },
  {
    id: "flame",
    category: "nature",
    viewBox: "0 0 24 24",
    body: `<path d="M12.5 1.5c1 4.5 5.5 6 5.5 11a6 6 0 0 1-12 0c0-2 1-3.3 1.3-5.3.9 1 1.9 1.3 1.9 1.3 0-3.2 1.2-5.4 3.3-7z" fill="${F}"/>`,
  },
  {
    id: "mountain",
    category: "nature",
    viewBox: "0 0 24 24",
    body: `<polygon points="1,21 9,7 13.5,14 16.5,9.5 23,21" fill="${F}"/>`,
  },

  // ── 선 · 구분 ───────────────────────────────────────────────────────────
  {
    id: "lineSolid",
    category: "line",
    viewBox: "0 0 48 8",
    body: `<rect x="0" y="3" width="48" height="2" fill="${F}"/>`,
  },
  {
    id: "lineThick",
    category: "line",
    viewBox: "0 0 48 8",
    body: `<rect x="0" y="2" width="48" height="4" rx="2" fill="${F}"/>`,
  },
  {
    id: "lineDashed",
    category: "line",
    viewBox: "0 0 48 8",
    body: `<path d="M0 4h48" ${S} stroke-width="2" stroke-dasharray="7 5"/>`,
  },
  {
    id: "lineDotted",
    category: "line",
    viewBox: "0 0 48 8",
    body: `<path d="M1 4h46" ${S} stroke-width="3" stroke-dasharray="0.1 7"/>`,
  },
  {
    id: "lineWave",
    category: "line",
    viewBox: "0 0 48 8",
    body: `<path d="M1 4c3-3 5-3 8 0s5 3 8 0 5-3 8 0 5 3 8 0 5-3 8 0" ${S} stroke-width="2"/>`,
  },
  {
    id: "lineZigzag",
    category: "line",
    viewBox: "0 0 48 8",
    body: `<path d="M1 6l5-4 5 4 5-4 5 4 5-4 5 4 5-4 5 4" ${S} stroke-width="2"/>`,
  },
  {
    id: "lineTaper",
    category: "line",
    viewBox: "0 0 48 8",
    body: `<polygon points="0,4 24,1 48,4 24,7" fill="${F}"/>`,
  },
  {
    id: "lineDotDivider",
    category: "line",
    viewBox: "0 0 48 8",
    body: `<path d="M0 4h19M29 4h19" ${S} stroke-width="1.5"/><circle cx="24" cy="4" r="2.5" fill="${F}"/>`,
  },
  {
    id: "underlineSwash",
    category: "line",
    viewBox: "0 0 48 10",
    body: `<path d="M1 7c13-5 33-6 46-3l-.8 3.4C33.6 4.6 14 5.6 2 10z" fill="${F}"/>`,
  },
  {
    id: "bracketPair",
    category: "line",
    viewBox: "0 0 24 24",
    body: `<path d="M8 2H3v20h5M16 2h5v20h-5" ${S} stroke-width="2"/>`,
  },
  {
    id: "cornerBracket",
    category: "line",
    viewBox: "0 0 24 24",
    body: `<path d="M2 9V2h7M22 15v7h-7" ${S} stroke-width="2"/>`,
  },

  // ── 배지 · 리본 ─────────────────────────────────────────────────────────
  {
    id: "banner",
    category: "badge",
    viewBox: "0 0 48 20",
    body: `<polygon points="0,0 48,0 48,20 24,14 0,20" fill="${F}"/>`,
  },
  {
    id: "flag",
    category: "badge",
    viewBox: "0 0 48 16",
    body: `<polygon points="0,0 48,0 42,8 48,16 0,16" fill="${F}"/>`,
  },
  {
    id: "ribbon",
    category: "badge",
    viewBox: "0 0 48 20",
    body: `<path d="M6 0h36l-4 10 4 10H6l4-10z" fill="${F}"/>`,
  },
  {
    id: "coupon",
    category: "badge",
    viewBox: "0 0 48 20",
    body: `<path d="M0 0h48v6a4 4 0 0 0 0 8v6H0v-6a4 4 0 0 0 0-8z" fill="${F}"/>`,
  },
  {
    id: "priceTag",
    category: "badge",
    viewBox: "0 0 24 24",
    body: `<path fill-rule="evenodd" d="M11 2H4a2 2 0 0 0-2 2v7l11 11 9-9zM7 5.5a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z" fill="${F}"/>`,
  },
  {
    id: "bookmark",
    category: "badge",
    viewBox: "0 0 24 24",
    body: `<polygon points="6,2 18,2 18,22 12,17 6,22" fill="${F}"/>`,
  },
  {
    id: "sealBurst",
    category: "badge",
    viewBox: "0 0 24 24",
    body: `<path d="M12 1.5l2.4 2.3 3.2-.8.9 3.2 3 1.4-1.6 2.9 1.6 2.9-3 1.4-.9 3.2-3.2-.8L12 19.5l-2.4-2.3-3.2.8-.9-3.2-3-1.4L4.1 10.5 2.5 7.6l3-1.4.9-3.2 3.2.8z" fill="${F}"/>`,
  },
  {
    id: "badgeHex",
    category: "badge",
    viewBox: "0 0 24 24",
    body: `<path fill-rule="evenodd" d="M12 1.5l9 5.2v10.6l-9 5.2-9-5.2V6.7zm0 3.5L6 8.4v7.2l6 3.4 6-3.4V8.4z" fill="${F}"/>`,
  },
];

/** 화면에 그릴 순서. 카탈로그가 늘어도 이 순서는 안 흔들린다. */
export const SHAPE_CATEGORIES: readonly ShapeCategory[] = [
  "basic",
  "arrow",
  "star",
  "bubble",
  "nature",
  "line",
  "badge",
];

/** 네이티브 `figure`로 들어가는 셋. 카탈로그에는 없지만 검색에는 걸려야 한다. */
export const NATIVE_SHAPE_IDS: readonly string[] = ["rect", "rounded", "circle"];

/**
 * 검색어 사전.
 *
 * 화면에 뜨는 이름은 로케일 파일에 있지만 **검색은 그걸 안 본다.** 사람은 "네모"를
 * "사각형"이라고도 "박스"라고도 치고, 표시 이름은 그중 하나만 고를 수 있다. 그래서
 * 표시 이름과 별개로 부르는 말을 여기 모은다(영어 id는 자동으로 걸리므로 안 적는다).
 */
export const SHAPE_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  rect: ["네모", "사각형", "박스", "정사각형", "square", "box"],
  rounded: ["둥근네모", "둥근사각형", "라운드", "round"],
  circle: ["동그라미", "원", "circle", "dot"],

  triangle: ["삼각형", "세모"],
  triangleDown: ["역삼각형", "아래세모", "down"],
  triangleRight: ["오른쪽세모", "재생", "play"],
  rightTriangle: ["직각삼각형", "직각"],
  diamond: ["마름모", "다이아", "다이아몬드"],
  parallelogram: ["평행사변형", "기울인네모", "사선"],
  trapezoid: ["사다리꼴"],
  pentagon: ["오각형"],
  hexagon: ["육각형", "벌집", "헥사"],
  hexagonFlat: ["육각형", "가로육각형", "벌집"],
  heptagon: ["칠각형"],
  octagon: ["팔각형", "정지", "stop"],
  semicircle: ["반원", "반달"],
  quarterCircle: ["부채꼴", "사분원", "코너"],
  ring: ["도넛", "고리", "링", "원테두리", "donut"],
  pill: ["알약", "캡슐", "태그", "capsule"],
  cross: ["십자", "플러스", "더하기", "plus"],
  frame: ["테두리", "프레임", "사각테두리", "border"],
  frameRounded: ["테두리", "프레임", "둥근테두리", "border"],

  arrowRight: ["화살표", "오른쪽", "우측"],
  arrowLeft: ["화살표", "왼쪽", "좌측"],
  arrowUp: ["화살표", "위", "상승"],
  arrowDown: ["화살표", "아래", "하락"],
  arrowBoth: ["화살표", "양방향", "좌우"],
  arrowBlock: ["화살표", "두꺼운", "굵은"],
  arrowCorner: ["화살표", "꺾인", "ㄴ자", "코너"],
  arrowCurve: ["화살표", "굽은", "곡선", "유턴"],
  chevronRight: ["갈매기", "화살표", "꺾쇠", "다음"],
  chevronDown: ["갈매기", "화살표", "꺾쇠", "아래"],
  arrowBanner: ["화살표", "배너", "단계", "순서"],
  arrowThin: ["화살표", "얇은", "선"],

  star: ["별", "다섯", "평점"],
  star4: ["별", "반짝", "네갈래"],
  star6: ["별", "육각별", "여섯갈래"],
  star8: ["별", "팔각별", "여덟갈래"],
  sparkle: ["반짝", "빛", "신제품", "sparkle"],
  burst: ["폭발", "터짐", "강조", "burst"],
  heart: ["하트", "좋아요", "사랑"],
  shield: ["방패", "보호", "안전", "인증"],

  bubbleRect: ["말풍선", "대화", "후기", "사각"],
  bubbleRound: ["말풍선", "대화", "후기", "둥근"],
  bubbleOval: ["말풍선", "대화", "후기", "타원"],
  bubbleTailLeft: ["말풍선", "대화", "왼쪽꼬리"],
  bubbleThought: ["말풍선", "생각", "구름"],

  cloud: ["구름", "날씨"],
  drop: ["물방울", "수분", "보습", "워터"],
  leaf: ["잎", "나뭇잎", "식물", "비건", "자연"],
  bolt: ["번개", "전기", "빠름", "파워"],
  moon: ["달", "밤", "야간"],
  flame: ["불꽃", "불", "인기", "핫"],
  mountain: ["산", "풍경", "성장"],

  lineSolid: ["선", "실선", "구분선", "divider"],
  lineThick: ["선", "굵은선", "구분선"],
  lineDashed: ["선", "파선", "점선", "구분선"],
  lineDotted: ["선", "점선", "구분선"],
  lineWave: ["선", "물결", "웨이브"],
  lineZigzag: ["선", "지그재그"],
  lineTaper: ["선", "뾰족", "장식선"],
  lineDotDivider: ["선", "구분선", "점"],
  underlineSwash: ["밑줄", "강조", "붓", "언더라인"],
  bracketPair: ["대괄호", "괄호", "강조"],
  cornerBracket: ["모서리", "괄호", "코너", "프레임"],

  banner: ["배너", "리본", "띠", "제목"],
  flag: ["깃발", "배너", "띠"],
  ribbon: ["리본", "배너", "띠"],
  coupon: ["쿠폰", "티켓", "할인"],
  priceTag: ["가격표", "태그", "라벨", "할인"],
  bookmark: ["북마크", "책갈피", "저장"],
  sealBurst: ["씰", "인증", "배지", "도장"],
  badgeHex: ["배지", "육각", "인증"],
};

/** 검색 비교용 정규화 — 띄어쓰기·대소문자·하이픈을 지운다. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s_-]/g, "");
}

/**
 * 도형 id를 검색어로 거른다. 빈 검색어는 **거르지 않는다**(전체 목록이 기본이다).
 *
 * 비교 대상은 id와 사전뿐이다. 화면 이름(로케일)은 안 본다 — 언어를 바꿨다고 검색
 * 결과가 달라지면 "아까 나왔는데 왜 안 나오지"가 된다.
 */
export function shapeMatches(id: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  if (normalize(id).includes(q)) return true;
  return (SHAPE_KEYWORDS[id] ?? []).some((word) => normalize(word).includes(q));
}

/** 미리보기와 실제 삽입이 **같은 마크업**을 쓴다 — 눌러 보고 다른 것이 나오면 안 된다. */
export function shapeMarkup(shape: BasicShape): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${shape.viewBox}">${shape.body}</svg>`;
}

export function shapesInCategory(category: ShapeCategory): BasicShape[] {
  return BASIC_SHAPES.filter((shape) => shape.category === category);
}
