/**
 * 기본 스펙과 **좌측 패널 프리셋 카탈로그**.
 *
 * 프리셋 룩은 범용 차트 라이브러리 기본값이 아니라 우리 템플릿이 실제로 쓰는 형태에서
 * 뽑았다(가로 막대 + 라벨/값 한 줄 + 강조 항목 하나). 범용 차트 스타일은 상세페이지에
 * 얹는 순간 바로 "AI티"가 난다 — 공용 도형 카탈로그를 템플릿에서 추출한 것과 같은 원칙.
 */

import type { ChartCard, ChartKind, ChartSpec, ChartStyle } from "./types";

/** 폰트를 못 정했을 때. 편집기 캔버스가 쓰는 본문 폰트와 같다. */
export const FALLBACK_CHART_FONT = "Pretendard";

/**
 * 기본 팔레트 — 무채색 램프.
 *
 * 알록달록한 기본 팔레트를 주면 사용자가 그대로 두고, 상세페이지 전체 톤이 깨진다.
 * 흑연 램프는 어떤 브랜드 색과도 안 싸우고, 강조 색은 사용자가 하나만 고르면 된다.
 */
export const DEFAULT_CHART_PALETTE = ["#18181B", "#52525B", "#A1A1AA", "#D4D4D8"];

export const DEFAULT_CHART_STYLE: ChartStyle = {
  palette: DEFAULT_CHART_PALETTE,
  mutedColor: "#D4D4D8",
  trackColor: "#F4F4F5",
  labelColor: "#3F3F46",
  valueColor: "#18181B",
  fontFamily: FALLBACK_CHART_FONT,
  labelSize: 20,
  valueSize: 22,
  barSize: 16,
  gap: 26,
  labelGap: 12,
  plotSize: 260,
  cornerRadius: 8,
  showTrack: true,
};

/** 새 차트를 놓을 때 들어가는 예시 데이터(사용자가 바로 갈아 끼울 것). */
const SAMPLE = {
  labels: ["본 제품", "일반 제품 A", "일반 제품 B"],
  values: [92, 61, 45],
};

export type ChartSpecInit = {
  kind?: ChartKind;
  width: number;
  fontFamily?: string;
  style?: Partial<ChartStyle>;
  options?: Partial<ChartSpec["options"]>;
  data?: ChartSpec["data"];
};

/** 기본 스펙 한 벌. ``frame.height``는 렌더가 채우므로 0으로 시작한다. */
export function createChartSpec({
  kind = "bar-h",
  width,
  fontFamily,
  style,
  options,
  data,
}: ChartSpecInit): ChartSpec {
  return {
    v: 1,
    kind,
    frame: { width: Math.max(80, Math.round(width)), height: 0 },
    data: data ?? {
      labels: [...SAMPLE.labels],
      series: [{ name: "값", values: [...SAMPLE.values] }],
    },
    options: {
      max: "auto",
      unit: "",
      decimals: 0,
      showValue: true,
      sort: "none",
      highlightIndex: 0,
      ...options,
    },
    style: {
      ...DEFAULT_CHART_STYLE,
      fontFamily: fontFamily || FALLBACK_CHART_FONT,
      ...style,
    },
  };
}

export type ChartPreset = {
  id: string;
  kind: ChartKind;
  /** ``branding`` 네임스페이스의 라벨 키. */
  labelKey: string;
  style?: Partial<ChartStyle>;
  options?: Partial<ChartSpec["options"]>;
  /** 예시 데이터. 안 주면 ``SAMPLE``. 시리즈가 여럿이어야 뜻이 사는 종류만 채운다. */
  data?: ChartSpec["data"];
};

/** 여러 줄 비교용 예시(꺾은선·누적). 한 줄짜리 샘플로는 범례가 안 뜬다. */
const MULTI_SAMPLE: ChartSpec["data"] = {
  labels: ["1주", "2주", "4주", "8주"],
  series: [
    { name: "본 제품", values: [42, 61, 78, 92] },
    { name: "일반 제품", values: [40, 47, 53, 58] },
  ],
};

/**
 * 프리셋이 기본으로 까는 **흰 바탕**.
 *
 * 차트는 글자와 얇은 선으로 이루어져 있어서 바탕이 없으면 섹션 배경색을 그대로 탄다.
 * 어두운 섹션에 놓는 순간 검은 글씨가 사라지고, 미리보기(흰 패널 위)와 결과가 달라진다.
 * ``card``는 이미 있던 기구다 — 여기서는 테두리 없이 바탕과 안여백만 쓴다.
 *
 * 기본값(``DEFAULT_CHART_STYLE``)이 아니라 **프리셋에만** 건다. 기본값을 바꾸면 이미
 * 문서에 박힌 차트들이 다시 그려질 때 같이 변한다.
 */
const CARD_PLAIN: ChartCard = {
  fill: "#FFFFFF",
  stroke: null,
  width: 0,
  radius: 8,
  pad: 24,
};

/**
 * 좌측 패널에 뜨는 프리셋.
 *
 * 종류당 하나가 아니라 "쓰임"당 하나다 — 같은 가로 막대라도 비교표(강조 있음)와
 * 순위표(강조 없음, 정렬됨)는 다른 물건이다.
 */
const PRESETS: ChartPreset[] = [
  {
    id: "bar-h-compare",
    kind: "bar-h",
    labelKey: "detailPage.chart.presets.barHCompare",
    options: { highlightIndex: 0 },
  },
  {
    id: "bar-h-rank",
    kind: "bar-h",
    labelKey: "detailPage.chart.presets.barHRank",
    options: { highlightIndex: null, sort: "desc" },
    style: { showTrack: false, barSize: 22 },
  },
  {
    id: "bar-h-percent",
    kind: "bar-h",
    labelKey: "detailPage.chart.presets.barHPercent",
    options: { unit: "%", max: 100, highlightIndex: null },
    style: { barSize: 12, cornerRadius: 6 },
  },
  {
    id: "bar-v-compare",
    kind: "bar-v",
    labelKey: "detailPage.chart.presets.barVCompare",
    options: { highlightIndex: 0 },
  },
  {
    id: "bar-v-plain",
    kind: "bar-v",
    labelKey: "detailPage.chart.presets.barVPlain",
    options: { highlightIndex: null },
    style: { showTrack: false, barSize: 56, cornerRadius: 6 },
  },
  {
    // 축 있는 막대그래프 — 브랜드 상세페이지가 실제로 쓰는 모양이다(기둥 밴드 ·
    // 점선 눈금선 · 좌·하 축선 · 왼쪽 눈금 라벨 · 카드 프레임). 클라이언트 디자이너
    // 요구사항 "도표의 경우 선을 명확하게 사용"이 여기 들어 있다.
    //
    // 지금 브랜드 템플릿은 이 모양을 손으로 계산한 통짜 SVG로 굽는다("1% = 6.5px"를
    // 네 곳에 반영). 이 프리셋은 같은 그림을 resolved.max 하나에서 뽑으므로 수치를
    // 고치면 막대·눈금선·눈금 라벨이 같이 따라간다.
    id: "bar-v-axis",
    kind: "bar-v",
    labelKey: "detailPage.chart.presets.barVAxis",
    options: { unit: "%", highlightIndex: null },
    style: {
      showTrack: false,
      cornerRadius: 0,
      barSize: 72,
      plot: {
        bands: "#F6F7F9",
        grid: { count: 4, color: "#E3E5E8", dash: true },
        axis: { color: "#1F2124", width: 1.4 },
        ticks: { color: "#8A8F96", size: 14, unitCap: "(%)", gutter: 52 },
      },
      card: { fill: "#FFFFFF", stroke: "#E3E5E8", width: 1, radius: 4, pad: 26 },
    },
  },
  {
    id: "donut-share",
    kind: "donut",
    labelKey: "detailPage.chart.presets.donutShare",
    options: { unit: "%", highlightIndex: 0 },
    style: { showTrack: false },
  },
  {
    id: "gauge-rate",
    kind: "gauge",
    labelKey: "detailPage.chart.presets.gaugeRate",
    options: { unit: "%", max: 100, highlightIndex: 0 },
  },
  {
    id: "line-trend",
    kind: "line",
    labelKey: "detailPage.chart.presets.lineTrend",
    options: { highlightIndex: null },
    style: { showTrack: false },
  },
  {
    id: "stack-mix",
    kind: "stack",
    labelKey: "detailPage.chart.presets.stackMix",
    options: { highlightIndex: null },
    style: { showTrack: false },
  },
  {
    // 값만 남긴 가로 막대 — 트랙도 강조도 없이 순위만 읽히면 되는 자리.
    id: "bar-h-minimal",
    kind: "bar-h",
    labelKey: "detailPage.chart.presets.barHMinimal",
    options: { highlightIndex: null, showValue: true },
    style: { showTrack: false, barSize: 10, cornerRadius: 5, gap: 34 },
  },
  {
    // 순위 세로 막대 — 내림차순으로 세워 1위가 왼쪽에 온다.
    id: "bar-v-rank",
    kind: "bar-v",
    labelKey: "detailPage.chart.presets.barVRank",
    options: { highlightIndex: 0, sort: "desc" },
    style: { showTrack: false, barSize: 48, cornerRadius: 6 },
  },
  {
    // 굵은 도넛 — 비중 하나를 크게 보여 준다(만족도·재구매율).
    id: "donut-single",
    kind: "donut",
    labelKey: "detailPage.chart.presets.donutSingle",
    options: { unit: "%", max: 100, highlightIndex: 0 },
    style: { showTrack: true, plotSize: 300 },
  },
  {
    // 점수 게이지 — 100점 만점 대신 단위를 "점"으로 둔다.
    id: "gauge-score",
    kind: "gauge",
    labelKey: "detailPage.chart.presets.gaugeScore",
    options: { unit: "점", max: 100, decimals: 0, highlightIndex: 0 },
    style: { showTrack: true, barSize: 26 },
  },
  {
    // 여러 줄 꺾은선 — 우리와 경쟁 제품을 같은 축에서 비교한다(범례가 붙는다).
    id: "line-compare",
    kind: "line",
    labelKey: "detailPage.chart.presets.lineCompare",
    options: { highlightIndex: null, showValue: false },
    style: { showTrack: false, plotSize: 280 },
    data: MULTI_SAMPLE,
  },
  {
    // 100% 누적 — 구성비를 한 줄에 채운다(성분 비율·연령대 분포).
    id: "stack-share",
    kind: "stack",
    labelKey: "detailPage.chart.presets.stackShare",
    options: { unit: "%", max: 100, highlightIndex: null },
    style: { showTrack: false, barSize: 34, cornerRadius: 4 },
    data: {
      labels: ["보습", "진정", "탄력"],
      series: [
        { name: "본 제품", values: [48, 32, 20] },
        { name: "일반 제품", values: [30, 30, 40] },
      ],
    },
  },
];

/**
 * 좌측 패널이 읽는 최종 목록. 바탕을 안 정한 프리셋에는 흰 카드를 깐다 —
 * 삽입 결과가 미리보기와 같아야 한다(미리보기는 흰 패널 위에서 그려진다).
 */
export const CHART_PRESETS: ChartPreset[] = PRESETS.map((preset) => ({
  ...preset,
  style: { card: CARD_PLAIN, ...preset.style },
}));
