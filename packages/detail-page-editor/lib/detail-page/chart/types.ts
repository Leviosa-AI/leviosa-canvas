/**
 * 상세페이지 편집기 차트의 **데이터 모델**.
 *
 * 차트는 새 element 타입이 아니라 ``group`` 하나이고, 이 스펙은 그 그룹의
 * ``custom.chart``에 통째로 얹힌다. 그래서 저장·불러오기·undo가 공짜로 따라오고,
 * 내보내기(.ai/.psd/.svg/GIF)는 자식이 전부 기존 타입(figure/svg/text)이라 어댑터
 * 없이 그대로 동작한다. 자세한 근거는 ``docs/detail-page-chart-element-plan.md``.
 *
 * 이 파일과 같은 폴더의 모듈은 **canvas를 import하지 않는다**. 순수 계산만 담아야
 * 캔버스 없이 vitest에서 돌릴 수 있다(스토어를 만지는 건 ``sync.ts`` 하나뿐이고,
 * 그것도 구조적 타입으로만 접근한다).
 */

export type ChartKind =
  | "bar-h"
  | "bar-v"
  | "donut"
  | "line"
  | "stack"
  | "gauge";

/** 종류를 바꿔도 살아남는 정규형 데이터. 렌더러는 이걸 읽기만 한다. */
export type ChartData = {
  labels: string[];
  series: ChartSeries[];
};

export type ChartSeries = {
  name: string;
  /** 빈 칸은 ``null``. 렌더러가 0으로 눌러버리면 "값 없음"과 "0"이 구분되지 않는다. */
  values: (number | null)[];
};

export type ChartOptions = {
  /** 축 최댓값. ``"auto"``면 데이터에서 뽑는다. */
  max: number | "auto";
  /** 값 뒤에 붙는 단위("%", "ms", "점"). */
  unit: string;
  decimals: number;
  showValue: boolean;
  sort: "none" | "desc" | "asc";
  /**
   * 강조할 항목 인덱스(보통 "우리 제품").
   *
   * 지정하면 그 항목만 팔레트 색, 나머지는 ``mutedColor``가 된다 — 템플릿의
   * ``.bar`` vs ``.bar.alt`` 대비를 그대로 옮긴 것.
   */
  highlightIndex: number | null;
};

export type ChartStyle = {
  /** 항목/시리즈 색. 강조 항목이 지정되면 첫 색만 쓰인다. */
  palette: string[];
  /** 강조 대상이 아닌 항목 색. */
  mutedColor: string;
  /** 막대 트랙(빈 부분) 색. */
  trackColor: string;
  labelColor: string;
  valueColor: string;
  fontFamily: string;
  labelSize: number;
  valueSize: number;
  /** 막대 두께(가로형은 높이, 세로형은 폭). */
  barSize: number;
  /** 항목 사이 간격. */
  gap: number;
  /** 라벨 줄과 막대 사이 간격. */
  labelGap: number;
  /** 세로형·라인의 플롯 높이(가로형은 프레임 폭이 축 길이라 안 쓴다). */
  plotSize: number;
  cornerRadius: number;
  /** 빈 트랙을 깔지 여부. 끄면 막대만 뜬다. */
  showTrack: boolean;
  /**
   * 판 크롬 — 축·눈금선·기둥 밴드·눈금 라벨.
   *
   * 브랜드 상세페이지의 막대그래프는 이걸 전부 갖고 있고, 지금은 그 좌표를 손으로
   * 계산해 통짜 SVG로 굽는다("1% = 6.5px"를 네 곳에 반영). 여기 옵션으로 들어오면
   * 그 환산이 렌더러 한 줄이 된다.
   *
   * ``undefined``면 아무것도 안 그린다 — 기존 프리셋의 렌더 결과가 안 바뀐다.
   * 세로 막대(``bar-v``)만 읽는다.
   */
  plot?: ChartPlotChrome;
  /**
   * 차트를 감싸는 카드(바탕 + 테두리 + 안여백). 종류와 무관하게 걸린다.
   *
   * ``undefined``면 카드를 안 그린다.
   */
  card?: ChartCard;
};

export type ChartPlotChrome = {
  /** 항목 뒤에 까는 옅은 기둥. ``null``이면 안 깐다. */
  bands: string | null;
  /** 가로 눈금선. ``count``는 0선을 뺀 칸 수다. */
  grid: { count: number; color: string; dash: boolean } | null;
  /** 좌·하 축선. */
  axis: { color: string; width: number } | null;
  /** 왼쪽 눈금 라벨. ``unitCap``은 맨 위에 얹는 단위 표기("(%)"). */
  ticks: { color: string; size: number; unitCap: string; gutter: number } | null;
};

export type ChartCard = {
  fill: string;
  stroke: string | null;
  width: number;
  radius: number;
  pad: number;
};

export type ChartSpec = {
  v: 1;
  kind: ChartKind;
  /**
   * 차트의 논리 크기. ``width``는 입력값이고 ``height``는 렌더 결과로 갱신된다
   * (행이 늘면 자연히 키가 커야 하므로 높이를 사용자가 정하게 두지 않는다).
   */
  frame: { width: number; height: number };
  data: ChartData;
  options: ChartOptions;
  style: ChartStyle;
};

/**
 * 렌더러가 뱉는 요소 하나.
 *
 * ``key``는 재생성 사이에 유지되는 안정 식별자다. sync가 이 키로 기존 자식을 찾아
 * ``set``하기 때문에 요소 id가 보존되고, 그래서 선택·undo·레이어 트리가 흔들리지 않는다.
 * ``props.x``/``props.y``는 **프레임 좌상단 기준 로컬 좌표**이고, 페이지 좌표로 옮기는
 * 건 sync의 몫이다.
 */
export type ChartNode = {
  key: string;
  props: Record<string, unknown>;
};

export type ChartRender = {
  nodes: ChartNode[];
  /** 이 스펙이 실제로 차지하는 크기. ``spec.frame``에 되먹임한다. */
  size: { width: number; height: number };
};

/** 차트 자식임을 표시하는 custom 키(레이어 트리·해제에서 쓴다). */
export const CHART_PART = "chartPart";
