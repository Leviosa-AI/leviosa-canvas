import { describe, expect, it } from "vitest";

import { createChartSpec } from "../defaults";
import { absorbResize, CHART_KINDS, renderChart } from "../render";
import type { ChartNode, ChartSpec } from "../types";

function byKey(nodes: ChartNode[], key: string): ChartNode | undefined {
  return nodes.find((node) => node.key === key);
}

function baseSpec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    ...createChartSpec({
      width: 600,
      data: {
        labels: ["가", "나"],
        series: [{ name: "값", values: [50, 100] }],
      },
    }),
    ...overrides,
  };
}

describe("renderChart · 공통", () => {
  it("고를 수 있는 종류는 전부 렌더러가 있다", () => {
    // 드롭다운이 렌더러 없는 종류를 노출하면 조용히 가로 막대로 떨어진다.
    expect(CHART_KINDS.length).toBeGreaterThan(0);
    for (const kind of CHART_KINDS) {
      const render = renderChart(baseSpec({ kind }));
      expect(render.nodes.length).toBeGreaterThan(0);
      expect(render.size.height).toBeGreaterThan(0);
    }
  });

  it("기본 타입만 쓴다(내보내기 4경로가 아는 것들)", () => {
    for (const kind of CHART_KINDS) {
      for (const node of renderChart(baseSpec({ kind })).nodes) {
        expect(["figure", "text", "svg"]).toContain(node.props.type);
        if (node.props.type === "figure") {
          expect(["rect", "circle", "ellipse"]).toContain(node.props.subType);
        }
      }
    }
  });

  it("키는 재생성 사이에 유지되고 중복되지 않는다", () => {
    const spec = baseSpec();
    const first = renderChart(spec).nodes.map((n) => n.key);
    const second = renderChart({ ...spec }).nodes.map((n) => n.key);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });
});

describe("renderChart · 가로 막대", () => {
  it("막대 길이가 값에서 나온다", () => {
    const nodes = renderChart(baseSpec()).nodes;
    const half = byKey(nodes, "bar:0");
    const full = byKey(nodes, "bar:1");
    expect(full?.props.width).toBe(600);
    expect(half?.props.width).toBe(300);
  });

  it("값 라벨은 단위·소수점을 따른다", () => {
    const spec = baseSpec();
    const nodes = renderChart({
      ...spec,
      options: { ...spec.options, unit: "%", decimals: 1 },
    }).nodes;
    expect(byKey(nodes, "value:0")?.props.text).toBe("50.0%");
  });

  it("값 표시를 끄면 값 요소가 사라지고 라벨이 폭을 다 쓴다", () => {
    const spec = baseSpec();
    const nodes = renderChart({
      ...spec,
      options: { ...spec.options, showValue: false },
    }).nodes;
    expect(byKey(nodes, "value:0")).toBeUndefined();
    expect(byKey(nodes, "label:0")?.props.width).toBe(600);
  });

  it("트랙을 끄면 트랙 요소가 없다", () => {
    const spec = baseSpec();
    const nodes = renderChart({
      ...spec,
      style: { ...spec.style, showTrack: false },
    }).nodes;
    expect(byKey(nodes, "track:0")).toBeUndefined();
    expect(byKey(nodes, "bar:0")).toBeDefined();
  });

  it("값이 없으면 막대 길이가 0이다", () => {
    const spec = baseSpec();
    const nodes = renderChart({
      ...spec,
      data: { labels: ["가"], series: [{ name: "값", values: [null] }] },
    }).nodes;
    expect(byKey(nodes, "bar:0")?.props.width).toBe(0);
    expect(byKey(nodes, "value:0")?.props.text).toBe("");
  });

  it("행이 늘면 높이가 커진다", () => {
    const two = renderChart(baseSpec()).size.height;
    const spec = baseSpec();
    const four = renderChart({
      ...spec,
      data: {
        labels: ["가", "나", "다", "라"],
        series: [{ name: "값", values: [1, 2, 3, 4] }],
      },
    }).size.height;
    expect(four).toBeGreaterThan(two);
  });
});

describe("renderChart · 세로 막대", () => {
  it("값 라벨이 프레임 위로 넘치지 않는다", () => {
    // 꽉 찬 막대 위에도 값이 앉을 자리가 미리 비워져 있어야 한다.
    const nodes = renderChart(baseSpec({ kind: "bar-v" })).nodes;
    const value = byKey(nodes, "value:1");
    expect(value?.props.y).toBeGreaterThanOrEqual(0);
  });

  it("막대는 바닥에서 자란다", () => {
    const nodes = renderChart(baseSpec({ kind: "bar-v" })).nodes;
    const half = byKey(nodes, "bar:0");
    const full = byKey(nodes, "bar:1");
    const bottom = (n?: ChartNode) =>
      Number(n?.props.y ?? 0) + Number(n?.props.height ?? 0);
    expect(bottom(half)).toBe(bottom(full));
    expect(Number(full?.props.height)).toBeGreaterThan(Number(half?.props.height));
  });
});

describe("absorbResize", () => {
  it("가로만 늘리면 폭만 바뀌고 글자 크기는 그대로다", () => {
    const spec = { ...baseSpec(), frame: { width: 600, height: 200 } };
    const next = absorbResize(spec, { width: 900, height: 200 });
    expect(next.frame.width).toBe(900);
    expect(next.style.labelSize).toBe(spec.style.labelSize);
  });

  it("세로로 늘리면 세로 리듬이 함께 커진다", () => {
    const spec = { ...baseSpec(), frame: { width: 600, height: 200 } };
    const next = absorbResize(spec, { width: 600, height: 400 });
    expect(next.style.labelSize).toBe(spec.style.labelSize * 2);
    expect(next.style.barSize).toBe(spec.style.barSize * 2);
  });

  it("높이를 아직 모르면(첫 렌더 전) 스케일하지 않는다", () => {
    const spec = { ...baseSpec(), frame: { width: 600, height: 0 } };
    const next = absorbResize(spec, { width: 600, height: 500 });
    expect(next.style.labelSize).toBe(spec.style.labelSize);
  });

  it("변화가 없으면 같은 객체를 돌려준다", () => {
    const spec = { ...baseSpec(), frame: { width: 600, height: 200 } };
    expect(absorbResize(spec, { width: 600, height: 200 })).toBe(spec);
  });
});
