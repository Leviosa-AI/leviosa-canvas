import { describe, expect, it } from "vitest";

import {
  ean13CheckDigit,
  ean13Svg,
  normalizeEan13,
  qrCodeSvg,
} from "../qr-code";

describe("qrCodeSvg", () => {
  it("삽입 경로가 아는 모양으로 낸다 — viewBox 있는 svg 한 덩이", () => {
    const result = qrCodeSvg("https://leviosa.ai");
    expect(result).not.toBeNull();
    expect(result!.markup).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox=/);
    expect(result!.markup).toContain(`viewBox="${result!.viewBox}"`);
    expect(result!.markup.endsWith("</svg>")).toBe(true);
  });

  it("정사각이고 여백 4모듈을 포함한다", () => {
    const result = qrCodeSvg("A")!;
    const [, , width, height] = result.viewBox.split(" ").map(Number);
    expect(width).toBe(height);
    // 가장 작은 QR이 21모듈, 여백 4씩이라 최소 29다.
    expect(width).toBeGreaterThanOrEqual(29);
  });

  it("모듈을 rect 수백 개가 아니라 path 하나로 합친다", () => {
    const markup = qrCodeSvg("https://leviosa.ai/detail/12345")!.markup;
    expect(markup.match(/<path/g)).toHaveLength(1);
    // 배경 하나뿐이다.
    expect(markup.match(/<rect/g)).toHaveLength(1);
  });

  it("색이 둘뿐이라 우측 스와치도 둘이다", () => {
    const markup = qrCodeSvg("x", { foreground: "#112233", background: "#ffeedd" })!.markup;
    expect(markup).toContain('fill="#112233"');
    expect(markup).toContain('fill="#ffeedd"');
  });

  it("배경 none 이면 배경 사각형을 안 그린다", () => {
    const markup = qrCodeSvg("x", { foreground: "#000000", background: "none" })!.markup;
    expect(markup).not.toContain("<rect");
  });

  it("내용이 길수록 모듈이 는다", () => {
    const small = Number(qrCodeSvg("A")!.viewBox.split(" ")[2]);
    const big = Number(qrCodeSvg("A".repeat(300))!.viewBox.split(" ")[2]);
    expect(big).toBeGreaterThan(small);
  });

  it("빈 내용은 만들지 않는다", () => {
    expect(qrCodeSvg("")).toBeNull();
    expect(qrCodeSvg("   ")).toBeNull();
  });

  it("버전 40에도 안 들어가는 길이는 null 로 물러난다", () => {
    expect(qrCodeSvg("가".repeat(5000))).toBeNull();
  });
});

describe("ean13CheckDigit", () => {
  it("알려진 값과 맞는다", () => {
    // 4006381333931 — GS1 문서의 예시 코드.
    expect(ean13CheckDigit("400638133393")).toBe(1);
    // 8801043030618 — 국내 상품 코드 모양.
    expect(ean13CheckDigit("880104303061")).toBe(8);
  });

  it("자릿수가 안 맞으면 null", () => {
    expect(ean13CheckDigit("12345")).toBeNull();
    expect(ean13CheckDigit("4006381333931")).toBeNull();
    expect(ean13CheckDigit("40063813339a")).toBeNull();
  });
});

describe("normalizeEan13", () => {
  it("12자리면 체크디짓을 붙인다", () => {
    expect(normalizeEan13("400638133393")).toBe("4006381333931");
  });

  it("13자리면 체크디짓을 검사한다", () => {
    expect(normalizeEan13("4006381333931")).toBe("4006381333931");
    expect(normalizeEan13("4006381333932")).toBeNull();
  });

  it("하이픈·공백은 무시한다", () => {
    expect(normalizeEan13("400-6381 333931")).toBe("4006381333931");
  });

  it("길이가 아예 다르면 null", () => {
    expect(normalizeEan13("123")).toBeNull();
    expect(normalizeEan13("")).toBeNull();
  });
});

describe("ean13Svg", () => {
  it("규격대로 95모듈 + 좌우 여백이다", () => {
    const result = ean13Svg("4006381333931")!;
    const [, , width] = result.viewBox.split(" ").map(Number);
    expect(width).toBe(11 + 95 + 7);
  });

  it("체크디짓을 채워 돌려준다", () => {
    expect(ean13Svg("400638133393")!.value).toBe("4006381333931");
  });

  it("숫자를 사람이 읽게 아래에 얹는다", () => {
    const markup = ean13Svg("4006381333931")!.markup;
    expect(markup).toContain(">4<");
    expect(markup).toContain(">006381<");
    expect(markup).toContain(">333931<");
  });

  it("막대는 path 하나다", () => {
    expect(ean13Svg("4006381333931")!.markup.match(/<path/g)).toHaveLength(1);
  });

  it("잘못된 코드는 만들지 않는다", () => {
    expect(ean13Svg("4006381333932")).toBeNull();
    expect(ean13Svg("hello")).toBeNull();
  });

  it("가드 막대가 숫자 영역까지 내려온다", () => {
    const d = /d="([^"]+)"/.exec(ean13Svg("4006381333931")!.markup)![1];
    // 시작 가드(모듈 0)는 긴 막대다 — 첫 명령이 v73(=68+5)이어야 한다.
    expect(d.startsWith("M11 0h1v73")).toBe(true);
  });
});
