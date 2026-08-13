import { describe, expect, it } from "vitest";

import {
  clipBox,
  cornerRadius,
  cssUrl,
  displayText,
  fillProps,
  imageSrc,
  isSingleLineBox,
  konvaFontStyle,
  lineHeightRatio,
  shadowProps,
  textDecoration,
  textStroke,
} from "../render/attrs";

describe("lineHeightRatio", () => {
  it("CSS px 문자열을 배수로 되돌린다", () => {
    // 이걸 그대로 Konva에 넘기면 NaN이 되어 글자가 겹치거나 사라진다.
    expect(lineHeightRatio("48.4px", 44)).toBeCloseTo(1.1, 5);
  });

  it("무단위 비율은 그대로", () => {
    expect(lineHeightRatio(1.9, 20)).toBe(1.9);
    expect(lineHeightRatio("1.9", 20)).toBe(1.9);
  });

  it("절대 px 숫자는 폰트 크기로 나눈다", () => {
    expect(lineHeightRatio(36, 20)).toBe(1.8);
  });

  it("못 읽으면 1.2", () => {
    expect(lineHeightRatio(undefined, 20)).toBe(1.2);
    expect(lineHeightRatio("normal", 20)).toBe(1.2);
    expect(lineHeightRatio(0, 20)).toBe(1.2);
  });
});

describe("konvaFontStyle", () => {
  it("굵기와 기울기를 한 문자열로 합친다", () => {
    expect(konvaFontStyle({ fontWeight: "700" })).toBe("bold");
    expect(konvaFontStyle({ fontWeight: 400 })).toBe("normal");
    expect(konvaFontStyle({ fontWeight: "bold" })).toBe("bold");
  });

  it("기울기는 문서의 fontStyle만 본다", () => {
    expect(konvaFontStyle({ fontStyle: "italic", fontWeight: "600" })).toBe(
      "italic bold",
    );
    expect(konvaFontStyle({ fontStyle: "italic" })).toBe("italic normal");
  });

  it("custom에 남은 CSS 기울기는 그리지 않는다", () => {
    // 디컴포저의 기록일 뿐 계약이 아니다. 읽으면 오늘 팔리는 그림에 없던 기울임이
    // 생긴다(cremolab 표지 Didot). 승격은 문서를 싣는 앱의 몫.
    expect(konvaFontStyle({ fontWeight: "600", custom: { fontStyle: "italic" } })).toBe(
      "bold",
    );
    expect(konvaFontStyle({ custom: { fontStyle: "italic" } })).toBe("normal");
  });
});

describe("textDecoration / displayText", () => {
  it("네이티브가 우선, 없으면 custom의 CSS 값", () => {
    expect(textDecoration({ textDecoration: "underline" })).toBe("underline");
    expect(
      textDecoration({ custom: { decoration: "line-through solid rgb(0,0,0)" } }),
    ).toBe("line-through");
    expect(textDecoration({ custom: { decoration: "none" } })).toBe("");
  });

  it("text-transform을 실제 글자에 반영한다", () => {
    expect(displayText({ text: "leviosa", custom: { textTransform: "uppercase" } })).toBe(
      "LEVIOSA",
    );
    expect(displayText({ text: "Leviosa" })).toBe("Leviosa");
  });
});

describe("textStroke", () => {
  it("폭이 0이면 아무것도 안 준다", () => {
    expect(textStroke({ custom: { strokeWidth: 0, strokeColor: "#fff" } })).toEqual({});
  });

  it("custom에 있는 테두리를 네이티브 속성으로 낸다", () => {
    expect(textStroke({ custom: { strokeWidth: 2, strokeColor: "#fff" } })).toEqual({
      stroke: "#fff",
      strokeWidth: 2,
    });
  });
});

describe("fillProps", () => {
  it("단색은 그대로", () => {
    expect(fillProps({ fill: "rgb(1, 2, 3)" }, 100, 50)).toEqual({
      fill: "rgb(1, 2, 3)",
    });
  });

  it("fill이 CSS 그라디언트면 Konva 그라디언트로 바꾼다", () => {
    const props = fillProps({ fill: "linear-gradient(90deg, #000 0%, #fff 100%)" }, 100, 50);
    expect(props.fill).toBeUndefined();
    expect(props.fillLinearGradientColorStops).toEqual([0, "#000", 1, "#fff"]);
  });

  it("디컴포저가 custom에 남긴 그라디언트도 읽는다", () => {
    const props = fillProps(
      { fill: "", custom: { gradient: "linear-gradient(180deg, #a 0%, #b 100%)" } },
      10,
      10,
    );
    expect(props.fillLinearGradientColorStops).toBeDefined();
  });
});

describe("shadowProps", () => {
  it("네이티브 shadow*가 켜져 있으면 그걸 쓴다", () => {
    expect(
      shadowProps({ shadowEnabled: true, shadowBlur: 4, shadowColor: "#123" }),
    ).toMatchObject({ shadowEnabled: true, shadowBlur: 4, shadowColor: "#123" });
  });

  it("없으면 custom.shadow의 CSS box-shadow를 파싱한다", () => {
    expect(shadowProps({ custom: { shadow: "0px 4px 8px rgba(0,0,0,0.2)" } })).toEqual({
      shadowEnabled: true,
      shadowColor: "rgba(0,0,0,0.2)",
      shadowBlur: 8,
      shadowOffsetX: 0,
      shadowOffsetY: 4,
    });
  });

  it("그림자가 없으면 아무것도 안 준다", () => {
    expect(shadowProps({})).toEqual({});
  });
});

describe("clipBox / cornerRadius", () => {
  it("custom.clipToRect를 읽는다", () => {
    expect(clipBox({ custom: { clipToRect: { x: 1, y: 2, width: 10, height: 20, radius: 4 } } })).toEqual({
      x: 1,
      y: 2,
      width: 10,
      height: 20,
      radius: 4,
    });
  });

  it("크기가 없으면 자르지 않는다", () => {
    expect(clipBox({ custom: { clipToRect: { width: 0, height: 0 } } })).toBeNull();
    expect(clipBox({})).toBeNull();
  });

  it("모서리 반지름은 네이티브 우선", () => {
    expect(cornerRadius({ cornerRadius: 8, custom: { cornerRadius: 2 } })).toBe(8);
    expect(cornerRadius({ custom: { cornerRadius: 2 } })).toBe(2);
    expect(cornerRadius({})).toBe(0);
  });
});

describe("이미지 주소", () => {
  it("url(...)에서 주소만 뽑는다", () => {
    expect(cssUrl('url("/a/b.jpg")')).toBe("/a/b.jpg");
    expect(cssUrl("url(/a/b.jpg)")).toBe("/a/b.jpg");
    expect(cssUrl("linear-gradient(#000, #fff)")).toBeNull();
  });

  it("따옴표 안의 괄호를 안 자른다 — SVG data URI 가 그렇다", () => {
    const uri = "data:image/svg+xml,%3Csvg%3E%3Cg transform='translate(4,2)'/%3E";
    expect(cssUrl(`url("${uri}")`)).toBe(uri);
    expect(cssUrl(`url( '/a b.jpg' )`)).toBe("/a b.jpg");
    expect(cssUrl("url(  /a/b.jpg  )")).toBe("/a/b.jpg");
  });

  it("닫는 괄호가 없는 긴 값에서 멈추지 않는다", () => {
    // 되짚기가 길이의 제곱이던 시절에는 이런 값 하나가 렌더를 세웠다.
    const started = Date.now();
    expect(cssUrl(`url(${" ".repeat(60_000)}`)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("src가 비면 디컴포저의 목업 사진을 쓴다", () => {
    expect(
      imageSrc({ src: "", custom: { placeholderBgImage: 'url("/mock.jpg")' } }),
    ).toBe("/mock.jpg");
    expect(imageSrc({ src: "/real.png", custom: { placeholderBgImage: 'url("/mock.jpg")' } })).toBe(
      "/real.png",
    );
    expect(imageSrc({})).toBe("");
  });
});

describe("isSingleLineBox", () => {
  it("한 줄 높이 상자는 접으면 안 되는 상자다", () => {
    expect(isSingleLineBox({ height: 48, fontSize: 44, lineHeight: "48.4px" })).toBe(true);
  });

  it("본문처럼 키가 큰 상자는 접는다", () => {
    expect(isSingleLineBox({ height: 300, fontSize: 20, lineHeight: 1.6 })).toBe(false);
  });
});
