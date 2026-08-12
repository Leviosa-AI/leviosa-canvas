/**
 * 디자인 레퍼런스 경계 계약 — 서버와 **같은 규칙**을 브라우저에서도 건다.
 *
 * 한쪽만 고치면 화면에서는 붙었는데 요청이 422 로 돌아오거나, 반대로 화면이 미리 막아
 * 서버가 허용하는 것을 못 넣게 된다.
 */

import { describe, expect, it } from "vitest";

import {
  ACCEPTED_REFERENCE_TYPES,
  DESIGN_REFERENCE_ASPECTS,
  MAX_DESIGN_REFERENCES,
  MAX_REFERENCE_FILE_BYTES,
  UNKNOWN_IMAGE_TOKENS,
  dataUriByteLength,
  estimateBriefCredits,
  estimateImageInputTokens,
  referenceFileRejection,
  referenceOrdinal,
} from "../design-reference";

function file(name: string, type: string, size: number): File {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("design reference contract", () => {
  it("서버와 같은 장수 상한을 쓴다", () => {
    // 프론트가 더 보내면 서버가 거절하고, 적게 막으면 넣을 수 있는 것을 못 넣는다.
    expect(MAX_DESIGN_REFERENCES).toBe(6);
  });

  it("축 어휘는 서버 키와 같다", () => {
    expect(DESIGN_REFERENCE_ASPECTS.map((a) => a.key)).toEqual([
      "palette",
      "typography",
      "layout",
      "content",
      "mood",
      "decoration",
    ]);
  });

  it("축마다 설명이 붙는다", () => {
    // "내용 구성"은 이름만으로 문구까지 베끼는 것으로 읽힌다 — 그 오해가 저작권 사고다.
    expect(DESIGN_REFERENCE_ASPECTS.every((a) => a.hint.length > 0)).toBe(true);
  });

  it("움짤도 받는다 — 첫 프레임으로 읽히는 편이 막는 것보다 낫다", () => {
    expect(ACCEPTED_REFERENCE_TYPES).toContain("image/gif");
    expect(referenceFileRejection(file("a.gif", "image/gif", 1024))).toBeNull();
  });

  it("비전 모델이 못 읽는 형식은 거절한다", () => {
    expect(referenceFileRejection(file("a.pdf", "application/pdf", 1024))).toMatch(
      /PNG/,
    );
    expect(referenceFileRejection(file("a.svg", "image/svg+xml", 1024))).toMatch(
      /PNG/,
    );
  });

  it("원본이 너무 크면 읽기 전에 막는다", () => {
    // 줄이기 전에 브라우저 메모리가 먼저 눕는다.
    expect(
      referenceFileRejection(file("a.png", "image/png", MAX_REFERENCE_FILE_BYTES + 1)),
    ).toMatch(/MB/);
    expect(
      referenceFileRejection(file("a.png", "image/png", MAX_REFERENCE_FILE_BYTES)),
    ).toBeNull();
  });

  it("data URI 의 실제 바이트를 잰다", () => {
    // 요청 본문 크기는 base64 길이가 아니라 디코드된 바이트다.
    expect(dataUriByteLength("data:image/png;base64,AAAA")).toBe(3);
    expect(dataUriByteLength("data:image/png;base64,AAA=")).toBe(2);
    expect(dataUriByteLength("data:image/png;base64,AA==")).toBe(1);
    expect(dataUriByteLength("not-a-data-uri")).toBe(0);
  });

  it("번호는 1부터 센다", () => {
    // 셀러가 "1번 이미지"라고 쓰므로 화면·프롬프트가 같은 수를 써야 한다.
    expect(referenceOrdinal(0)).toBe("1번");
    expect(referenceOrdinal(1)).toBe("2번");
  });
});

/**
 * 판독 값은 **선차감**이라 누르기 전에 화면에 떠 있어야 하고, 그러려면 이 공식이 서버의
 * ``estimate_brief_credits`` 와 같은 수를 내야 한다. 어긋나면 화면이 말한 값과 실제
 * 청구가 달라진다 — 그건 안내가 아니다.
 */
describe("판독 크레딧", () => {
  it("값은 넓이가 아니라 512px 타일 수로 정해진다", () => {
    // 1024×1024 는 4타일, 1024×400 은 2타일. 넓이는 2.5배지만 값은 2배다.
    expect(estimateImageInputTokens(1024, 1024)).toBe(85 + 170 * 4);
    expect(estimateImageInputTokens(1024, 400)).toBe(85 + 170 * 2);
  });

  it("작은 그림을 키워서 세지 않는다", () => {
    expect(estimateImageInputTokens(200, 200)).toBe(85 + 170);
  });

  it("크기를 못 재면 비싼 쪽으로 잡는다", () => {
    // 싸게 잡으면 화면이 말한 값보다 실제 청구가 커진다.
    expect(estimateImageInputTokens(0, 0)).toBe(UNKNOWN_IMAGE_TOKENS);
    expect(estimateBriefCredits([0])).toBe(estimateBriefCredits([UNKNOWN_IMAGE_TOKENS]));
  });

  it("같은 장수라도 큰 그림이 비싸다", () => {
    const small = estimateImageInputTokens(512, 512);
    const tall = estimateImageInputTokens(523, 1568);
    expect(estimateBriefCredits([tall])).toBeGreaterThan(estimateBriefCredits([small]));
  });

  it("한 장 더 붙였다고 값이 싸지지는 않는다", () => {
    const one = estimateImageInputTokens(1024, 1024);
    const charges = Array.from({ length: MAX_DESIGN_REFERENCES }, (_, i) =>
      estimateBriefCredits(Array(i + 1).fill(one)),
    );
    expect(charges).toEqual([...charges].sort((a, b) => a - b));
  });

  it("아무것도 안 붙였으면 값도 없다", () => {
    expect(estimateBriefCredits([])).toBe(0);
  });

  it("흔한 한 장은 그대로 1크레딧이다", () => {
    // 정액 1cr 이던 자리를 공식으로 바꿨다 — 흔한 한 장의 값이 바뀌면 그건 인상이다.
    expect(estimateBriefCredits([estimateImageInputTokens(1024, 1024)])).toBe(1);
  });
});
