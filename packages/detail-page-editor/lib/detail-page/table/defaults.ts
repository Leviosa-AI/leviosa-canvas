/**
 * 표 기본값과 프리셋.
 *
 * **프리셋은 브랜드 상세페이지 실물에서 뽑았다.** 범용 표 라이브러리 기본값(굵은 격자·
 * 회색 머리글)은 상세페이지에 얹는 순간 "AI티"가 난다. 근거가 되는 마크업은
 * `docs/detail-page-table-element-plan.md` §0.2에 파일·줄 번호로 적어 뒀다.
 *
 * 구조(첫 칸 190px 고정, 행 구분선, 위 굵은 선)는 브랜드 값을 그대로 쓰고, **색은 중립
 * 먹빛**으로 둔다. 브랜드 색을 그대로 구우면 다른 문서에 넣었을 때 혼자 튄다 — 색은
 * 인스펙터에서 문서 팔레트에 맞춘다.
 */

import type { CellAlign, TableSpec, TableStyle } from "./types";

/** 문서에서 폰트를 못 고를 때의 마지막 기본값. */
export const FALLBACK_TABLE_FONT = "Pretendard";

const INK = "#1F2124";
const BODY = "#3C4043";
const LINE = "#E3E5E8";
const LINE_SOFT = "#EFF1F3";
const CELL = "#F5F6F8";

/**
 * 브랜드 두 곳이 똑같이 쓰는 골격.
 *
 * 첫 칸 190px · 글자 18px · 좌우 여백 22px · 상하 여백 20px.
 */
export const DEFAULT_TABLE_STYLE: TableStyle = {
  fontFamily: FALLBACK_TABLE_FONT,
  fontSize: 18,
  color: BODY,
  padX: 22,
  padY: 20,

  firstWidth: 190,
  columnWidths: null,
  firstFill: null,
  firstAlign: "left",
  firstColor: INK,
  firstWeight: 700,
  firstFontFamily: null,
  firstSize: null,

  columnRule: null,
  rowRule: { color: LINE_SOFT, width: 1 },
  topRule: { color: INK, width: 1.5 },
  outerBorder: null,

  bodyFill: null,
  zebraFill: LINE_SOFT,
  headerFill: null,
  headerColor: INK,
  headerWeight: 700,
};

export const DEFAULT_TABLE_DATA = {
  columns: ["항목", "내용"],
  rows: [
    ["용량", "50ml"],
    ["제형", "가볍게 발리는 젤 크림"],
    ["사용 시점", "아침 · 저녁 세안 후"],
  ],
};

export type CreateTableOptions = {
  kind?: TableSpec["kind"];
  width?: number;
  data?: TableSpec["data"];
  style?: Partial<TableStyle>;
  options?: Partial<TableSpec["options"]>;
};

export function createTableSpec({
  kind = "keyvalue",
  width = 646,
  data = DEFAULT_TABLE_DATA,
  style = {},
  options = {},
}: CreateTableOptions = {}): TableSpec {
  return {
    v: 1,
    kind,
    frame: { width, height: 0 },
    data: {
      columns: [...data.columns],
      rows: data.rows.map((row) => [...row]),
    },
    options: {
      headerRow: true,
      align: [],
      zebra: false,
      ...options,
    },
    style: { ...DEFAULT_TABLE_STYLE, ...style },
  };
}

export type TablePreset = {
  id: string;
  /** 로케일 키(`detailPage.table.preset.*`). */
  labelKey: string;
  kind: TableSpec["kind"];
  style: Partial<TableStyle>;
  options?: Partial<TableSpec["options"]>;
  data?: TableSpec["data"];
};

const SPEC_DATA = DEFAULT_TABLE_DATA;

const RIGHT_ALIGNED: CellAlign[] = ["left", "right"];

const SIZE_DATA = {
  columns: ["SIZE", "총장", "어깨", "가슴"],
  rows: [
    ["S", "120", "32", "96"],
    ["M", "123", "33", "102"],
    ["L", "126", "34", "108"],
  ],
};

/**
 * 좌측 패널에 뜨는 프리셋.
 *
 * 1·2번이 브랜드 두 판이다 — **구조는 같고 스타일 값 네 개만 다르다**
 * (`firstFill` · `columnRule` · `outerBorder` · `bodyFill`). 렌더러에 브랜드 분기가
 * 없다는 걸 이 둘이 증명한다.
 */
const PRESETS: TablePreset[] = [
  {
    // 헤어라인 스펙표 — 위 굵은 선 + 행 구분선만. 채움도 테두리도 없다.
    id: "spec-hairline",
    labelKey: "detailPage.table.preset.specHairline",
    kind: "keyvalue",
    style: {},
    data: SPEC_DATA,
  },
  {
    // 칸 구분 스펙표 — 이름 칸에 바탕을 깔고 세로선으로 가른다. 긴 값(전성분)에서
    // 어느 줄의 값인지 눈으로 따라가려면 이 판이 필요하다.
    id: "spec-celled",
    labelKey: "detailPage.table.preset.specCelled",
    kind: "keyvalue",
    style: {
      firstFill: CELL,
      columnRule: { color: LINE, width: 1 },
      rowRule: { color: LINE, width: 1 },
      outerBorder: { color: LINE, width: 1, radius: 4 },
      bodyFill: "#FFFFFF",
    },
    data: SPEC_DATA,
  },
  {
    // 값 우측정렬 목록 — 수치를 오른쪽 끝에 세워 자릿수를 맞춘다.
    id: "spec-right",
    labelKey: "detailPage.table.preset.specRight",
    kind: "keyvalue",
    style: { firstWidth: 200, rowRule: { color: LINE, width: 1 } },
    options: { align: RIGHT_ALIGNED },
    data: {
      columns: ["항목", "값"],
      rows: [
        ["보습 지속", "12시간"],
        ["임상 만족도", "94%"],
        ["끈적임 없음", "97%"],
      ],
    },
  },
  {
    // 가운데 정렬 타입표 — 이름 칸을 가운데로 세우고 강조색을 준다(피부 타입·라인업).
    id: "type-centered",
    labelKey: "detailPage.table.preset.typeCentered",
    kind: "keyvalue",
    style: {
      firstWidth: 168,
      firstAlign: "center",
      firstFill: CELL,
      firstWeight: 700,
      columnRule: { color: LINE, width: 1 },
      rowRule: { color: LINE, width: 1 },
      outerBorder: { color: LINE, width: 1, radius: 4 },
      bodyFill: "#FFFFFF",
      topRule: null,
    },
    data: {
      columns: ["타입", "이렇게 쓰세요"],
      rows: [
        ["건성", "밤에 한 번 더 덧발라 주세요"],
        ["지성", "얇게 한 겹만 펴 발라 주세요"],
        ["복합성", "볼에만 덧발라 주세요"],
      ],
    },
  },
  {
    // 머리글 있는 N열 그리드 — 사이즈표·비교표.
    id: "grid-header",
    labelKey: "detailPage.table.preset.gridHeader",
    kind: "grid",
    style: {
      firstWidth: null,
      headerFill: CELL,
      rowRule: { color: LINE, width: 1 },
      outerBorder: { color: LINE, width: 1, radius: 4 },
      bodyFill: "#FFFFFF",
      topRule: null,
      padX: 16,
    },
    options: { headerRow: true, align: ["center", "center", "center", "center"] },
    data: SIZE_DATA,
  },
  {
    // 얼룩 그리드 — 행이 많은 비교표에서 줄을 눈으로 따라가게 한다.
    id: "grid-zebra",
    labelKey: "detailPage.table.preset.gridZebra",
    kind: "grid",
    style: {
      firstWidth: null,
      headerFill: INK,
      headerColor: "#FFFFFF",
      rowRule: null,
      outerBorder: { color: LINE, width: 1, radius: 4 },
      bodyFill: "#FFFFFF",
      topRule: null,
      padX: 16,
    },
    options: { headerRow: true, zebra: true, align: ["left", "center", "center", "center"] },
    data: SIZE_DATA,
  },
  {
    // 비교표 — 첫 열은 항목, 우리 칸에 바탕을 깔아 눈이 먼저 간다.
    id: "grid-compare",
    labelKey: "detailPage.table.preset.gridCompare",
    kind: "grid",
    style: {
      firstWidth: 200,
      headerFill: CELL,
      rowRule: { color: LINE, width: 1 },
      columnRule: { color: LINE, width: 1 },
      outerBorder: { color: LINE, width: 1, radius: 4 },
      topRule: null,
      padX: 16,
    },
    options: { headerRow: true, align: ["left", "center", "center"] },
    data: {
      columns: ["비교 항목", "본 제품", "일반 제품"],
      rows: [
        ["보습 지속", "12시간", "6시간"],
        ["끈적임", "없음", "있음"],
        ["향료", "무첨가", "첨가"],
      ],
    },
  },
  {
    // 체크 비교표 — 값 대신 기호만 세운다. 스펙 숫자가 없을 때 쓰는 판.
    id: "grid-check",
    labelKey: "detailPage.table.preset.gridCheck",
    kind: "grid",
    style: {
      firstWidth: 240,
      headerFill: INK,
      headerColor: "#FFFFFF",
      rowRule: { color: LINE_SOFT, width: 1 },
      outerBorder: { color: LINE, width: 1, radius: 4 },
      topRule: null,
      padX: 16,
    },
    options: { headerRow: true, align: ["left", "center", "center"] },
    data: {
      columns: ["기능", "본 제품", "일반 제품"],
      rows: [
        ["저자극 테스트", "O", "X"],
        ["비건 인증", "O", "X"],
        ["국내 생산", "O", "O"],
      ],
    },
  },
  {
    // 선 없는 여백형 — 표처럼 안 보이는 표. 감성 톤 상세페이지의 스펙 자리다.
    id: "spec-airy",
    labelKey: "detailPage.table.preset.specAiry",
    kind: "keyvalue",
    style: {
      firstWidth: 170,
      firstColor: "#8A8F96",
      firstWeight: 500,
      rowRule: null,
      topRule: null,
      padY: 14,
    },
    data: SPEC_DATA,
  },
  {
    // 상자형 스펙표 — 큰 라운드 테두리 안에 넣는다. 섹션 하나를 통째로 채울 때.
    id: "spec-boxed",
    labelKey: "detailPage.table.preset.specBoxed",
    kind: "keyvalue",
    style: {
      firstWidth: 180,
      firstFill: CELL,
      rowRule: { color: LINE, width: 1 },
      outerBorder: { color: LINE, width: 1, radius: 14 },
      topRule: null,
      padX: 24,
      padY: 22,
    },
    data: SPEC_DATA,
  },
  {
    // 가격표 — 수치 열을 오른쪽 끝에 세워 자릿수를 맞춘다.
    id: "grid-price",
    labelKey: "detailPage.table.preset.gridPrice",
    kind: "grid",
    style: {
      firstWidth: null,
      headerFill: CELL,
      rowRule: { color: LINE_SOFT, width: 1 },
      outerBorder: { color: LINE, width: 1, radius: 4 },
      topRule: null,
      padX: 16,
    },
    options: { headerRow: true, align: ["left", "center", "right"] },
    data: {
      columns: ["구성", "수량", "정상가"],
      rows: [
        ["단품", "1개", "32,000"],
        ["2개 세트", "2개", "58,000"],
        ["선물 세트", "3개", "84,000"],
      ],
    },
  },
];

/**
 * 좌측 패널이 읽는 최종 목록. 바탕을 안 정한 프리셋에는 흰 바탕을 깐다.
 *
 * 표는 선과 글자뿐이라 바탕이 없으면 섹션 배경을 그대로 탄다 — 어두운 섹션에 놓는
 * 순간 먹빛 글씨가 사라지고, 흰 패널 위에서 그려진 미리보기와 결과가 달라진다.
 * 기본값(``DEFAULT_TABLE_STYLE``)이 아니라 **프리셋에만** 건다. 기본값을 바꾸면 이미
 * 문서에 박힌 표들이 다시 그려질 때 같이 변한다.
 */
export const TABLE_PRESETS: TablePreset[] = PRESETS.map((preset) => ({
  ...preset,
  style: { bodyFill: "#FFFFFF", ...preset.style },
}));
