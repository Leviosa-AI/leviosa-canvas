import { describe, expect, it } from "vitest";

import { parseChartTable } from "../paste";

describe("parseChartTable", () => {
  it("엑셀에서 온 탭 구분 텍스트를 읽는다", () => {
    const data = parseChartTable("항목\t점수\n가\t90\n나\t75");
    expect(data).toEqual({
      labels: ["가", "나"],
      series: [{ name: "점수", values: [90, 75] }],
    });
  });

  it("머리글이 없으면 첫 행도 데이터로 쓴다", () => {
    const data = parseChartTable("가\t90\n나\t75");
    expect(data?.labels).toEqual(["가", "나"]);
    expect(data?.series[0].values).toEqual([90, 75]);
  });

  it("CSV와 세미콜론도 받는다", () => {
    expect(parseChartTable("가,90\n나,75")?.series[0].values).toEqual([90, 75]);
    expect(parseChartTable("가;90\n나;75")?.series[0].values).toEqual([90, 75]);
  });

  it("여러 열이면 시리즈가 여러 개가 된다", () => {
    const data = parseChartTable("항목\t작년\t올해\n가\t10\t20");
    expect(data?.series.map((s) => s.name)).toEqual(["작년", "올해"]);
    expect(data?.series[1].values).toEqual([20]);
  });

  it("숫자 한 열만 붙여넣으면 라벨을 번호로 채운다", () => {
    const data = parseChartTable("10\n20\n30");
    expect(data?.labels).toEqual(["1", "2", "3"]);
    expect(data?.series[0].values).toEqual([10, 20, 30]);
  });

  it("라벨 한 열만 붙여넣으면 값은 비워 둔다", () => {
    const data = parseChartTable("가\n나");
    expect(data?.labels).toEqual(["가", "나"]);
    expect(data?.series[0].values).toEqual([null, null]);
  });

  it("천단위 콤마가 든 탭 데이터를 쉼표 구분으로 오인하지 않는다", () => {
    const data = parseChartTable("가\t1,234\n나\t5,678");
    expect(data?.series[0].values).toEqual([1234, 5678]);
  });

  it("빈 줄과 빈 입력을 흘려보낸다", () => {
    expect(parseChartTable("")).toBeNull();
    expect(parseChartTable("\n\n")).toBeNull();
    expect(parseChartTable("가\t1\n\n나\t2")?.labels).toEqual(["가", "나"]);
  });

  it("과한 붙여넣기는 잘라낸다", () => {
    const rows = Array.from({ length: 60 }, (_, i) => `행${i}\t${i}`).join("\n");
    expect(parseChartTable(rows)?.labels.length).toBe(24);
  });
});
