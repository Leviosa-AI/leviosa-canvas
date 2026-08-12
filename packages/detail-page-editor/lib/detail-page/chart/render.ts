/**
 * 스펙 → 요소 목록. **순수함수**이고 스토어를 모른다.
 *
 * 종류별 렌더러를 레지스트리로 물고 있어서, 새 종류는 렌더러 파일 하나 + 등록 한 줄로
 * 늘어난다. UI가 고를 수 있는 종류(``CHART_KINDS``)도 이 레지스트리에서 나오므로,
 * 아직 안 만든 종류가 드롭다운에 뜨는 일이 없다.
 */

import { resolveChart, type ResolvedChart } from "./normalize";
import { renderBarH } from "./renderers/bar-h";
import { renderBarV } from "./renderers/bar-v";
import { renderDonut } from "./renderers/donut";
import { renderGauge } from "./renderers/gauge";
import { renderLine } from "./renderers/line";
import { renderStack } from "./renderers/stack";
import type {
  ChartKind,
  ChartNode,
  ChartRender,
  ChartSpec,
  ChartStyle,
} from "./types";

type Renderer = (spec: ChartSpec, resolved: ResolvedChart) => ChartRender;

const RENDERERS: Partial<Record<ChartKind, Renderer>> = {
  "bar-h": renderBarH,
  "bar-v": renderBarV,
  donut: renderDonut,
  line: renderLine,
  stack: renderStack,
  gauge: renderGauge,
};

/** UI에 노출할 수 있는 종류(= 렌더러가 있는 종류). */
export const CHART_KINDS = Object.keys(RENDERERS) as ChartKind[];

export function hasRenderer(kind: ChartKind): boolean {
  return Boolean(RENDERERS[kind]);
}

/**
 * 차트를 카드(바탕 + 테두리 + 안여백)로 감싼다.
 *
 * 내용 전체를 ``pad``만큼 밀고 그만큼 큰 바탕을 맨 뒤에 깐다. 종류를 안 가리므로
 * 렌더러마다 카드 처리를 따로 두지 않는다.
 *
 * 테두리는 채움이 **있는** 사각형의 stroke로 그린다 — 투명 채움(rgba(0,0,0,0))은
 * .ai 내보내기에서 검은 박스로 굳은 전례가 있다.
 */
function withCard(render: ChartRender, spec: ChartSpec): ChartRender {
  const card = spec.style.card;
  if (!card) return render;
  const pad = Math.max(0, card.pad);
  const width = render.size.width + pad * 2;
  const height = render.size.height + pad * 2;
  const base: ChartNode = {
    key: "card",
    props: {
      type: "figure",
      subType: "rect",
      x: 0,
      y: 0,
      width: Math.round(width),
      height: Math.round(height),
      fill: card.fill,
      cornerRadius: Math.round(card.radius),
      ...(card.stroke && card.width > 0
        ? { stroke: card.stroke, strokeWidth: card.width }
        : {}),
    },
  };
  const moved = render.nodes.map((node) => ({
    ...node,
    props: {
      ...node.props,
      x: Math.round(Number(node.props.x ?? 0)) + pad,
      y: Math.round(Number(node.props.y ?? 0)) + pad,
    },
  }));
  return {
    nodes: [base, ...moved],
    size: { width: Math.round(width), height: Math.round(height) },
  };
}

/**
 * 렌더. 등록 안 된 종류는 가로 막대로 떨어진다 — 예전 문서에 저장된 종류를 열었을 때
 * 빈 그룹이 되는 것보다는 낫다.
 */
export function renderChart(spec: ChartSpec): ChartRender {
  const render = RENDERERS[spec.kind] ?? renderBarH;
  // 카드 여백은 **안쪽으로** 판다. 내용을 그만큼 좁게 그리고 카드가 원래 폭을 되찾는다.
  //
  // 밖으로 밀면 렌더 폭이 `frame.width`보다 커지는데, 그 값이 그대로 `frame.width`로
  // 저장된다(`spec-group/sync.ts`). 데이터를 고칠 때마다 차트가 여백 두 배씩 넓어진다.
  const pad = Math.max(0, spec.style.card?.pad ?? 0);
  const inner =
    pad > 0
      ? {
          ...spec,
          frame: { ...spec.frame, width: Math.max(80, spec.frame.width - pad * 2) },
        }
      : spec;
  return withCard(render(inner, resolveChart(inner)), spec);
}

/** 세로 리듬(글자·막대·간격)을 함께 키우고 줄이는 스타일 키. */
const SCALABLE: (keyof ChartStyle)[] = [
  "labelSize",
  "valueSize",
  "barSize",
  "gap",
  "labelGap",
  "plotSize",
  "cornerRadius",
];

/**
 * 세로 리듬만 배율로 키우거나 줄인다(프레임 폭은 호출자가 정한다).
 *
 * 리사이즈 흡수와 패널 썸네일이 같은 함수를 쓴다 — 그래야 썸네일이 실제 결과와 같은
 * 비례로 보인다.
 */
export function scaleChartStyle(spec: ChartSpec, factor: number): ChartSpec {
  const scale = Math.max(0.05, Math.min(20, factor));
  const style: ChartStyle = { ...spec.style };
  const writable = style as unknown as Record<string, unknown>;
  for (const key of SCALABLE) {
    const value = style[key];
    if (typeof value === "number") {
      writable[key] = Math.max(1, Math.round(value * scale));
    }
  }
  // 판 크롬·카드도 같이 줄인다. 안 그러면 썸네일에서 눈금 글자와 카드 여백만 원래
  // 크기로 남아 실제 결과와 다른 비례로 보인다. 선 두께는 안 건드린다 — 0.3px 선은
  // 썸네일에서 사라져 "선이 없는 차트"로 보인다.
  if (style.plot?.ticks) {
    style.plot = {
      ...style.plot,
      ticks: {
        ...style.plot.ticks,
        size: Math.max(4, Math.round(style.plot.ticks.size * scale)),
        gutter: Math.max(8, Math.round(style.plot.ticks.gutter * scale)),
      },
    };
  }
  if (style.card) {
    style.card = {
      ...style.card,
      pad: Math.max(2, Math.round(style.card.pad * scale)),
      radius: Math.max(0, Math.round(style.card.radius * scale)),
    };
  }
  return { ...spec, style };
}

/**
 * 사용자가 그룹을 잡아 늘린 걸 스펙에 **흡수**한다.
 *
 * 스톡 편집기는 그룹을 늘리면 자식을 스케일한다. 그 상태에서 데이터만 고쳐 다시 그리면
 * 원래 크기로 튕겨 돌아가 버린다. 그래서 재생성 직전에 실제 상자를 재서:
 *
 * - 가로 변화 → ``frame.width``만 갱신(막대가 길어질 뿐, 글자는 그대로)
 * - 세로 변화 → 세로 리듬(글자·막대 두께·간격)을 그 비율로 스케일
 *
 * 가로와 세로를 다르게 다루는 게 의도다. 가로로 늘렸을 때 글자까지 커지면 "폭만 넓히고
 * 싶었는데" 라는 상황이 매번 생긴다.
 */
export function absorbResize(
  spec: ChartSpec,
  actual: { width: number; height: number },
): ChartSpec {
  const width = Math.max(40, Math.round(actual.width));
  const previous = spec.frame.height;
  const changedHeight =
    previous > 0 && Math.abs(actual.height - previous) > 1;
  if (!changedHeight) {
    return width === spec.frame.width
      ? spec
      : { ...spec, frame: { ...spec.frame, width } };
  }
  const scaled = scaleChartStyle(
    spec,
    Math.max(0.2, Math.min(5, actual.height / previous)),
  );
  return { ...scaled, frame: { width, height: spec.frame.height } };
}
