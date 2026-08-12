import { describe, expect, it } from "vitest";

import { CHART_PRESETS, createChartSpec } from "../defaults";
import { chartPreviewSvg } from "../preview";
import { CHART_KINDS } from "../render";

const DATA = {
  labels: ["가", "나"],
  series: [{ name: "값", values: [50, 100] }],
};

describe("chartPreviewSvg", () => {
  it("모든 종류가 빈 썸네일을 내지 않는다", () => {
    for (const kind of CHART_KINDS) {
      const markup = chartPreviewSvg(
        createChartSpec({ kind, width: 220, data: DATA }),
      );
      expect(markup.startsWith("<svg")).toBe(true);
      // rect/text/path 중 뭐라도 그려져야 한다.
      expect(/<(rect|text|path)/.test(markup)).toBe(true);
    }
  });

  it("곡선 기하가 있는 종류는 path까지 담는다", () => {
    // 도넛/게이지 썸네일이 글자만 남고 고리가 빠지던 적이 있다(svg 노드를 안 옮겨서).
    for (const kind of ["donut", "gauge", "line"] as const) {
      const markup = chartPreviewSvg(
        createChartSpec({ kind, width: 220, data: DATA }),
      );
      expect(markup).toContain("<path");
    }
  });

  it("모든 프리셋이 그려진다", () => {
    for (const preset of CHART_PRESETS) {
      const markup = chartPreviewSvg(
        createChartSpec({
          kind: preset.kind,
          width: 220,
          style: preset.style,
          options: preset.options,
          data: DATA,
        }),
      );
      expect(/<(rect|text|path)/.test(markup)).toBe(true);
    }
  });

  it("글자를 이스케이프한다", () => {
    const markup = chartPreviewSvg(
      createChartSpec({
        width: 220,
        data: { labels: ["<b>&"], series: [{ name: "값", values: [1] }] },
      }),
    );
    expect(markup).toContain("&lt;b&gt;&amp;");
  });
});

describe("카드 프레임", () => {
  it("테두리 stroke를 썸네일에도 싣는다", () => {
    // 안 실으면 '축 있는 막대' 썸네일에서 카드 프레임이 사라진다.
    const axis = CHART_PRESETS.find((p) => p.id === "bar-v-axis")!;
    const markup = chartPreviewSvg(
      createChartSpec({ kind: axis.kind, width: 220, style: axis.style, data: DATA }),
    );
    expect(markup).toContain("stroke-width");
  });
});
