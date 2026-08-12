import { describe, expect, it } from "vitest";

import { createChartSpec } from "../defaults";
import { renderChart } from "../render";
import { estimateTextWidth } from "../renderers/shared";
import type { ChartNode, ChartSpec } from "../types";

function byKey(nodes: ChartNode[], key: string): ChartNode | undefined {
  return nodes.find((node) => node.key === key);
}

/** ``svg`` 노드의 마크업을 다시 꺼낸다(data URI는 base64). */
function markupOf(node: ChartNode | undefined): string {
  const src = String(node?.props.src ?? "");
  const base64 = src.split(",")[1] ?? "";
  return base64 ? atob(base64) : "";
}

function spec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    ...createChartSpec({
      width: 600,
      data: {
        labels: ["가", "나", "다"],
        series: [{ name: "값", values: [50, 30, 20] }],
      },
    }),
    ...overrides,
  };
}

function twoSeries(kind: ChartSpec["kind"]): ChartSpec {
  return spec({
    kind,
    data: {
      labels: ["가", "나"],
      series: [
        { name: "작년", values: [10, 20] },
        { name: "올해", values: [30, 40] },
      ],
    },
  });
}

describe("도넛", () => {
  it("항목마다 고리 조각을 그리고 글자는 SVG 밖에 둔다", () => {
    const base = spec({ kind: "donut" });
    const { nodes } = renderChart({
      ...base,
      style: { ...base.style, showTrack: false },
    });
    const ring = byKey(nodes, "ring");
    const markup = markupOf(ring);
    // xmlns가 없으면 편집기의 색 치환이 파싱에서 깨진다.
    expect(markup).toContain("xmlns");
    expect(markup.match(/<path/g)).toHaveLength(3);
    // 폰트가 시스템 폰트로 떨어지므로 SVG 안에는 글자를 절대 넣지 않는다.
    expect(markup).not.toContain("<text");
    expect(byKey(nodes, "center:value")?.props.type).toBe("text");
    expect(byKey(nodes, "label:0")?.props.type).toBe("text");
  });

  it("트랙을 켜면 조각 아래에 빈 고리가 한 겹 깔린다", () => {
    const { nodes } = renderChart(spec({ kind: "donut" }));
    expect(markupOf(byKey(nodes, "ring")).match(/<path/g)).toHaveLength(4);
  });

  it("값이 전부 비면 트랙 고리만 남는다", () => {
    const { nodes } = renderChart(
      spec({
        kind: "donut",
        data: { labels: ["가"], series: [{ name: "값", values: [null] }] },
      }),
    );
    expect(markupOf(byKey(nodes, "ring")).match(/<path/g)).toHaveLength(1);
  });

  it("가운데는 강조 항목의 값을 보여준다", () => {
    const base = spec({ kind: "donut" });
    const { nodes } = renderChart({
      ...base,
      options: { ...base.options, highlightIndex: 1, unit: "%" },
    });
    expect(byKey(nodes, "center:value")?.props.text).toBe("30%");
    expect(byKey(nodes, "center:label")?.props.text).toBe("나");
  });
});

describe("게이지", () => {
  it("반원이라 상자 높이가 지름의 절반이다", () => {
    const { nodes, size } = renderChart(spec({ kind: "gauge" }));
    const arc = byKey(nodes, "arc");
    expect(Number(arc?.props.height)).toBeLessThan(Number(arc?.props.width));
    expect(size.height).toBeGreaterThan(Number(arc?.props.height));
  });

  it("값이 0이면 채운 호가 없다", () => {
    const { nodes } = renderChart(
      spec({
        kind: "gauge",
        data: { labels: ["가"], series: [{ name: "값", values: [0] }] },
      }),
    );
    // 트랙 하나만 남는다.
    expect(markupOf(byKey(nodes, "arc")).match(/<path/g)).toHaveLength(1);
  });
});

describe("꺾은선", () => {
  it("시리즈마다 선과 점을 그린다", () => {
    const { nodes } = renderChart(twoSeries("line"));
    expect(markupOf(byKey(nodes, "line")).match(/<path/g)).toHaveLength(2);
    expect(byKey(nodes, "dot:0:0")?.props.subType).toBe("circle");
    expect(byKey(nodes, "dot:1:1")).toBeDefined();
  });

  it("시리즈가 여럿이면 범례가 붙고 값 라벨은 빠진다", () => {
    const { nodes } = renderChart(twoSeries("line"));
    expect(byKey(nodes, "legend:label:0")?.props.text).toBe("작년");
    // 여러 줄의 값이 점 위에 겹치면 아무것도 안 읽힌다.
    expect(byKey(nodes, "value:0")).toBeUndefined();
  });

  it("시리즈가 하나면 범례 없이 값 라벨이 붙고 프레임 위로 안 넘친다", () => {
    const { nodes } = renderChart(spec({ kind: "line" }));
    expect(byKey(nodes, "legend:label:0")).toBeUndefined();
    const top = byKey(nodes, "value:0");
    expect(top?.props.text).toBe("50");
    expect(Number(top?.props.y)).toBeGreaterThanOrEqual(0);
  });

  it("값이 빈 점은 찍지 않는다", () => {
    const { nodes } = renderChart(
      spec({
        kind: "line",
        data: {
          labels: ["가", "나", "다"],
          series: [{ name: "값", values: [10, null, 30] }],
        },
      }),
    );
    expect(byKey(nodes, "dot:0:1")).toBeUndefined();
    expect(byKey(nodes, "dot:0:2")).toBeDefined();
  });
});

describe("누적", () => {
  it("조각을 아래에서부터 쌓는다", () => {
    const { nodes } = renderChart(twoSeries("stack"));
    const lower = byKey(nodes, "bar:0:0");
    const upper = byKey(nodes, "bar:1:0");
    expect(Number(upper?.props.y)).toBeLessThan(Number(lower?.props.y));
    expect(Number(upper?.props.y) + Number(upper?.props.height)).toBe(
      Number(lower?.props.y),
    );
  });

  it("값 라벨은 기둥마다 합계 하나만 붙인다", () => {
    const { nodes } = renderChart(twoSeries("stack"));
    expect(byKey(nodes, "value:0")?.props.text).toBe("40");
    expect(byKey(nodes, "value:1")?.props.text).toBe("60");
  });

  it("가장 큰 기둥이 플롯을 꽉 채운다", () => {
    const chart = twoSeries("stack");
    const { nodes } = renderChart(chart);
    const total = ["bar:0:1", "bar:1:1"]
      .map((key) => Number(byKey(nodes, key)?.props.height))
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(chart.style.plotSize);
  });
});

describe("estimateTextWidth", () => {
  it("한글을 라틴보다 넓게 잡는다", () => {
    expect(estimateTextWidth("가나", 10)).toBeGreaterThan(
      estimateTextWidth("ab", 10),
    );
    expect(estimateTextWidth("", 10)).toBe(0);
  });
});
