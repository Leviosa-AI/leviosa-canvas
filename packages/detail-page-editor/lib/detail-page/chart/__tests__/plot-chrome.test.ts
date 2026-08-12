import { describe, expect, it } from "vitest";

import { CHART_PRESETS, createChartSpec } from "../defaults";
import { renderChart, scaleChartStyle } from "../render";
import type { ChartSpec } from "../types";

const DATA = {
  labels: ["1주", "4주", "8주"],
  series: [{ name: "값", values: [12, 24, 36] }],
};

function preset(id: string): ChartSpec {
  const found = CHART_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`no preset ${id}`);
  return createChartSpec({
    kind: found.kind,
    width: 600,
    style: found.style,
    options: found.options,
    data: DATA,
  });
}

function keys(spec: ChartSpec): string[] {
  return renderChart(spec).nodes.map((n) => n.key);
}

describe("판 크롬은 기본값이 off다", () => {
  // PR #1168로 들어간 프리셋은 렌더 결과가 그대로여야 한다.
  // `card`는 여기 안 든다 — 흰 바탕은 모든 프리셋이 깔고, 축·눈금·밴드와 성격이 다르다.
  const CHROME = /^(band:|grid:|axis:|tick:)/;

  it.each(CHART_PRESETS.filter((p) => p.id !== "bar-v-axis").map((p) => p.id))(
    "%s 는 크롬 노드를 안 만든다",
    (id) => {
      expect(keys(preset(id)).filter((k) => CHROME.test(k))).toEqual([]);
    },
  );

  it.each(CHART_PRESETS.map((p) => p.id))("%s 는 맨 뒤에 흰 바탕을 깐다", (id) => {
    // 차트는 글자와 얇은 선뿐이라 바탕이 없으면 섹션 배경을 그대로 탄다.
    const spec = preset(id);
    expect(spec.style.card?.fill).toBe("#FFFFFF");
    expect(keys(spec)[0]).toBe("card");
  });

  it("plot도 card도 없는 스펙은 크롬이 없다", () => {
    const plain = createChartSpec({ kind: "bar-v", width: 600, data: DATA });
    expect(plain.style.plot).toBeUndefined();
    expect(plain.style.card).toBeUndefined();
    expect(keys(plain).filter((k) => CHROME.test(k))).toEqual([]);
  });
});

describe("축 있는 막대(브랜드 재현)", () => {
  const spec = preset("bar-v-axis");
  const render = renderChart(spec);
  const keyList = render.nodes.map((n) => n.key);

  it("기둥 밴드·눈금선·축선·눈금 라벨·카드를 전부 그린다", () => {
    expect(keyList.filter((k) => k.startsWith("band:"))).toHaveLength(3);
    expect(keyList.filter((k) => k.startsWith("grid:"))).toHaveLength(4);
    expect(keyList).toContain("axis:y");
    expect(keyList).toContain("axis:x");
    expect(keyList.filter((k) => k.startsWith("tick:"))).toHaveLength(6); // 0~4 + 단위 캡
    expect(keyList[0]).toBe("card");
  });

  it("눈금 라벨은 네이티브 text다", () => {
    // SVG 안에 글자를 넣으면 <img>로 로드돼 페이지 폰트를 못 받는다.
    const ticks = render.nodes.filter((n) => n.key.startsWith("tick:"));
    for (const tick of ticks) expect(tick.props.type).toBe("text");
    expect(render.nodes.some((n) => n.props.type === "svg")).toBe(false);
  });

  it("눈금 라벨이 최댓값에서 나온다 — 값을 고치면 축이 같이 움직인다", () => {
    // 브랜드 템플릿은 이 환산("1% = 6.5px")을 손으로 네 곳에 반영해야 했다.
    const top = renderChart({
      ...spec,
      options: { ...spec.options, max: 40 },
    }).nodes.find((n) => n.key === "tick:4");
    expect(String(top?.props.text)).toBe("40");

    const doubled = renderChart({
      ...spec,
      options: { ...spec.options, max: 80 },
    }).nodes.find((n) => n.key === "tick:4");
    expect(String(doubled?.props.text)).toBe("80");
  });

  it("막대 높이가 눈금과 같은 자를 쓴다", () => {
    const fixed = { ...spec, options: { ...spec.options, max: 36 } };
    const nodes = renderChart(fixed).nodes;
    const bar = (i: number) => Number(nodes.find((n) => n.key === `bar:${i}`)?.props.height);
    // 값이 12·24·36이면 높이도 1:2:3이어야 한다.
    expect(bar(1) / bar(0)).toBeCloseTo(2, 1);
    expect(bar(2) / bar(0)).toBeCloseTo(3, 1);
  });

  it("눈금 자리만큼 판을 오른쪽으로 민다", () => {
    const nodes = renderChart(spec).nodes;
    const axisY = nodes.find((n) => n.key === "axis:y");
    const pad = spec.style.card?.pad ?? 0;
    expect(Number(axisY?.props.x)).toBe(pad + (spec.style.plot?.ticks?.gutter ?? 0));
  });

  it("카드 테두리는 채움 있는 사각형의 stroke로 그린다", () => {
    // 투명 채움은 .ai 내보내기에서 검은 박스가 된다.
    const card = render.nodes[0];
    expect(card.props.fill).toBe("#FFFFFF");
    expect(card.props.strokeWidth).toBe(1);
  });

  it("카드 안여백은 안쪽으로 판다 — 폭은 frame.width 그대로다", () => {
    const pad = spec.style.card!.pad;
    const narrow = renderChart({
      ...spec,
      style: { ...spec.style, card: undefined },
      frame: { ...spec.frame, width: spec.frame.width - pad * 2 },
    });
    expect(render.size.width).toBe(spec.frame.width);
    expect(render.size.height).toBe(narrow.size.height + pad * 2);
    expect(Number(render.nodes[0].props.width)).toBe(spec.frame.width);
  });

  it("다시 그려도 폭이 안 커진다", () => {
    // `spec-group/sync.ts`가 렌더 결과 폭을 `frame.width`로 되먹인다. 카드가 밖으로
    // 밀면 데이터를 고칠 때마다 여백 두 배씩 넓어진다.
    let current = spec;
    for (let i = 0; i < 3; i += 1) {
      const out = renderChart(current);
      current = { ...current, frame: { width: out.size.width, height: out.size.height } };
    }
    expect(current.frame.width).toBe(spec.frame.width);
  });
});

describe("scaleChartStyle", () => {
  it("눈금 글자와 카드 여백도 같이 줄인다", () => {
    // 안 줄이면 썸네일에서 이것들만 원래 크기로 남아 비례가 깨진다.
    const spec = preset("bar-v-axis");
    const small = scaleChartStyle(spec, 0.25);
    expect(small.style.plot!.ticks!.size).toBeLessThan(spec.style.plot!.ticks!.size);
    expect(small.style.card!.pad).toBeLessThan(spec.style.card!.pad);
  });

  it("선 두께는 안 건드린다", () => {
    const spec = preset("bar-v-axis");
    const small = scaleChartStyle(spec, 0.25);
    expect(small.style.plot!.axis!.width).toBe(spec.style.plot!.axis!.width);
    expect(small.style.card!.width).toBe(spec.style.card!.width);
  });
});
