import { describe, expect, it } from "vitest";

import { parseTableGrid } from "../paste";
import { tablePreviewSvg } from "../preview";
import { TABLE_PRESETS, createTableSpec } from "../defaults";

describe("parseTableGrid", () => {
  it("탭 구분 격자를 머리글 + 행으로 읽는다", () => {
    const parsed = parseTableGrid("SIZE\t총장\t가슴\nS\t120\t96\nM\t123\t102");
    expect(parsed).toEqual({
      columns: ["SIZE", "총장", "가슴"],
      rows: [
        ["S", "120", "96"],
        ["M", "123", "102"],
      ],
    });
  });

  it("첫 행부터 데이터면 행을 안 버린다", () => {
    // 스펙표는 머리글 없이 바로 항목/값으로 시작하는 일이 흔하다.
    const parsed = parseTableGrid("용량\t50ml\n제형\t젤 크림");
    expect(parsed?.rows).toHaveLength(2);
    expect(parsed?.rows[0]).toEqual(["용량", "50ml"]);
  });

  it("값 글자를 숫자로 바꾸지 않는다", () => {
    // 표는 "18mm · 310g" 같은 값을 그대로 실어야 한다.
    const parsed = parseTableGrid("두께\t18mm · 310g");
    expect(parsed?.rows[0][1]).toBe("18mm · 310g");
  });

  it("쉼표·세미콜론도 받는다", () => {
    expect(parseTableGrid("a,b\n1,2")?.rows[0]).toEqual(["1", "2"]);
    expect(parseTableGrid("a;b\n1;2")?.rows[0]).toEqual(["1", "2"]);
  });

  it("짧은 행은 빈 칸으로 채운다", () => {
    const parsed = parseTableGrid("a\tb\tc\n1\t2");
    expect(parsed?.rows[0]).toEqual(["1", "2", ""]);
  });

  it("읽을 게 없으면 null", () => {
    expect(parseTableGrid("")).toBeNull();
    expect(parseTableGrid("   \n  ")).toBeNull();
  });
});

describe("tablePreviewSvg", () => {
  it("모든 프리셋이 빈 썸네일을 내지 않는다", () => {
    for (const p of TABLE_PRESETS) {
      const markup = tablePreviewSvg(
        createTableSpec({
          kind: p.kind,
          width: 220,
          style: p.style,
          options: p.options,
          data: p.data,
        }),
      );
      expect(markup.startsWith("<svg")).toBe(true);
      expect(/<rect/.test(markup)).toBe(true);
      expect(/<text/.test(markup)).toBe(true);
    }
  });

  it("테두리 stroke를 썸네일에도 싣는다", () => {
    const celled = TABLE_PRESETS.find((p) => p.id === "spec-celled")!;
    const markup = tablePreviewSvg(
      createTableSpec({ kind: celled.kind, width: 220, style: celled.style }),
    );
    expect(markup).toContain("stroke-width");
  });

  it("글자를 이스케이프한다", () => {
    const markup = tablePreviewSvg(
      createTableSpec({
        width: 220,
        data: { columns: ["항목", "값"], rows: [["<b>&", "x"]] },
      }),
    );
    expect(markup).toContain("&lt;b&gt;&amp;");
  });
});
