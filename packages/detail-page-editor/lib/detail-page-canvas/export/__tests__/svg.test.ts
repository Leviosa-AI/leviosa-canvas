import { describe, expect, it } from "vitest";

import type { ExportDocument, ExportElement } from "../document-model";
import { buildSvgDocument, buildSvgPages, decodeSvgDataUri, escapeXml } from "../svg";

/** Deterministic measure: 10px per character, font-independent. */
const measure = (_el: ExportElement, s: string) => s.length * 10;

const doc: ExportDocument = {
  width: 400,
  height: 300,
  pages: [
    {
      id: "page-1",
      background: "rgb(240, 240, 240)",
      width: 400,
      height: 300,
      children: [
        {
          id: "t1",
          type: "text",
          x: 10,
          y: 20,
          width: 200,
          height: 30,
          text: "안녕 <세계> & \"친구\"",
          fontSize: 20,
          fontWeight: 700,
          fill: "rgb(0, 0, 0)",
          lineHeight: 1.5,
          align: "center",
        },
        {
          id: "grad",
          type: "figure",
          x: 0,
          y: 100,
          width: 100,
          height: 50,
          fill: "linear-gradient(90deg, rgb(0, 0, 0), rgb(255, 255, 255))",
        },
        {
          id: "img1",
          type: "image",
          x: 0,
          y: 160,
          width: 80,
          height: 80,
          cornerRadius: 12,
          src: "https://cdn.example.com/a.png",
          custom: { objectFit: "cover" },
        },
      ],
    },
    { id: "page-2", background: "white", width: 400, height: 200, children: [] },
  ],
};

describe("buildSvgDocument", () => {
  const svg = buildSvgDocument(doc, {
    measure,
    hrefFor: (src) => (src.startsWith("data:") ? src : "data:image/png;base64,AAAA"),
  });

  it("stacks pages with translate offsets inside one root svg", () => {
    expect(svg).toContain('viewBox="0 0 400 500"');
    expect(svg).toContain('<g id="p01 page-1">');
    expect(svg).toContain('<g id="p02 page-2" transform="translate(0 300)">');
  });

  it("keeps text as centered, escaped tspans", () => {
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('font-weight="700"');
    // center anchor: x + width/2 = 110
    expect(svg).toContain('<tspan x="110"');
    expect(svg).toContain("안녕 &lt;세계&gt; &amp; &quot;친구&quot;");
  });

  it("emits userSpaceOnUse gradient defs matching the Konva geometry", () => {
    expect(svg).toMatch(/<linearGradient[^>]*gradientUnits="userSpaceOnUse"/);
    // 90deg = left-to-right across the 100px-wide box at y=100.
    expect(svg).toMatch(/x1="0" y1="125" x2="100" y2="125"/);
    expect(svg).toContain('fill="url(#');
  });

  it("embeds images with objectFit mapping and a rounded clip", () => {
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(svg).toContain('href="data:image/png;base64,AAAA"');
    expect(svg).toMatch(/<clipPath id="[^"]+"><rect [^>]*rx="12"/);
    expect(svg).toContain('clip-path="url(#');
  });

  it("paints named-color page backgrounds", () => {
    expect(svg).toContain('<rect width="400" height="200" fill="white"/>');
  });
});

describe("buildSvgPages", () => {
  it("returns one standalone svg per selected page", () => {
    const pages = buildSvgPages(doc, { measure, pageIds: ["page-2"] });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain('viewBox="0 0 400 200"');
    expect(pages[0]).not.toContain("translate(");
  });
});

describe("svg-type elements", () => {
  it("inlines decodable svg data URIs as nested vector svg", () => {
    const inner = '<svg width="24" height="24"><circle cx="12" cy="12" r="10"/></svg>';
    const el: ExportElement = {
      id: "icon",
      type: "svg",
      x: 5,
      y: 6,
      width: 48,
      height: 48,
      src: `data:image/svg+xml;base64,${btoa(inner)}`,
    };
    const svg = buildSvgDocument(
      { width: 100, height: 100, pages: [{ id: "p", width: 100, height: 100, children: [el] }] },
      { measure },
    );
    expect(svg).toContain('viewBox="0 0 24 24"'); // synthesized from width/height
    expect(svg).toContain('<circle cx="12" cy="12" r="10"/>');
    expect(svg).not.toContain("<image");
  });

  it("falls back to <image> when the source is not inline svg", () => {
    const el: ExportElement = {
      id: "icon",
      type: "svg",
      x: 5,
      y: 6,
      width: 48,
      height: 48,
      src: "https://cdn.example.com/icon.svg",
    };
    const svg = buildSvgDocument(
      { width: 100, height: 100, pages: [{ id: "p", width: 100, height: 100, children: [el] }] },
      { measure },
    );
    expect(svg).toContain("<image ");
  });
});

describe("decodeSvgDataUri", () => {
  it("decodes base64 and URI-encoded payloads", () => {
    expect(decodeSvgDataUri(`data:image/svg+xml;base64,${btoa("<svg/>")}`)).toBe("<svg/>");
    expect(decodeSvgDataUri("data:image/svg+xml,%3Csvg%2F%3E")).toBe("<svg/>");
    expect(decodeSvgDataUri("data:image/png;base64,AAAA")).toBeNull();
  });
});

describe("escapeXml", () => {
  it("escapes markup-significant characters", () => {
    expect(escapeXml('a<b>&"c"')).toBe("a&lt;b&gt;&amp;&quot;c&quot;");
  });
});

/**
 * A layer the user hid with the eye toggle in the layers panel must never reach
 * an export — hiding it is a deliberate editorial choice. This has to hold for a
 * layer nested INSIDE a group too, which is where users actually hide things.
 */
describe("buildSvgPages — hidden layers", () => {
  const hiddenDoc: ExportDocument = {
    width: 200,
    height: 100,
    pages: [
      {
        id: "p1",
        background: "rgb(255, 255, 255)",
        width: 200,
        height: 100,
        children: [
          {
            id: "top-hidden",
            type: "text",
            x: 0,
            y: 0,
            width: 100,
            height: 20,
            text: "숨긴최상위",
            fontSize: 10,
            fill: "rgb(0, 0, 0)",
            visible: false,
          },
          {
            id: "g1",
            type: "group",
            x: 0,
            y: 0,
            width: 200,
            height: 60,
            children: [
              {
                id: "kept",
                type: "text",
                x: 0,
                y: 30,
                width: 100,
                height: 20,
                text: "보이는자식",
                fontSize: 10,
                fill: "rgb(0, 0, 0)",
              },
              {
                id: "child-hidden",
                type: "text",
                x: 0,
                y: 50,
                width: 100,
                height: 20,
                text: "숨긴자식",
                fontSize: 10,
                fill: "rgb(0, 0, 0)",
                visible: false,
              },
            ],
          },
        ],
      },
    ],
  };

  it("omits a hidden top-level layer and a hidden GROUP CHILD", () => {
    const [svg] = buildSvgPages(hiddenDoc, { measure });
    expect(svg).toContain("보이는자식");
    expect(svg).not.toContain("숨긴최상위");
    expect(svg).not.toContain("숨긴자식");
  });

  it("drops a group entirely when every child is hidden", () => {
    const allHidden: ExportDocument = {
      ...hiddenDoc,
      pages: [
        {
          id: "p1",
          background: "rgb(255, 255, 255)",
          width: 200,
          height: 100,
          children: [
            {
              id: "g2",
              type: "group",
              x: 0,
              y: 0,
              width: 200,
              height: 60,
              children: [
                {
                  id: "only",
                  type: "text",
                  x: 0,
                  y: 0,
                  width: 100,
                  height: 20,
                  text: "전부숨김",
                  fontSize: 10,
                  fill: "rgb(0, 0, 0)",
                  visible: false,
                },
              ],
            },
          ],
        },
      ],
    };
    const [svg] = buildSvgPages(allHidden, { measure });
    expect(svg).not.toContain("전부숨김");
    expect(svg).not.toContain('id="g2"');
  });
});

/**
 * 굵기·크기가 섞인 한 줄은 런마다 별개 요소로 쪼개져 있고, 런 사이 공백은 절대 x 좌표의
 * 여백(5~6px)으로만 남아 있다. 그 줄을 <text> 여러 개로 내보내면 여는 도구가 폰트를 조금만
 * 넓게 그려도(피그마의 폰트 대체) 여백이 먹히고 런끼리 붙는다. 한 <text> 안에서 tspan으로
 * 흘려보내면 간격을 좌표가 아니라 공백 문자가 만들므로 폰트가 바뀌어도 살아남는다.
 */
describe("buildSvgPages — 한 줄의 텍스트 런", () => {
  // Pretendard 27px 실측 근사: 한글 0.85em, 공백 0.25em, 그 외 0.5em
  const ko = (el: ExportElement, s: string) =>
    [...s].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 0.85 : ch === " " ? 0.25 : 0.5), 0) *
    Number(el.fontSize ?? 16);

  const run = (over: Partial<ExportElement>): ExportElement =>
    ({
      type: "text",
      y: 100,
      height: 32,
      fontSize: 27,
      fontWeight: "400",
      fill: "rgb(59, 55, 51)",
      lineHeight: "45.9px",
      letterSpacing: -0.0133,
      align: "left",
      fontFamily: "Pretendard",
      ...over,
    }) as ExportElement;

  const pageOf = (children: ExportElement[]): ExportDocument => ({
    width: 750,
    pages: [{ id: "p", width: 750, height: 200, children }],
  });

  const line = [
    run({ id: "r0", text: "흡수가", x: 131, width: 72 }),
    run({ id: "r1", text: "빠른", x: 206, width: 50, fontWeight: "800" }),
    run({ id: "r2", text: "콜로이드 미네랄", x: 259, width: 178 }),
  ];

  it("굵기가 섞인 한 줄을 하나의 <text>로 흘려보내고 공백을 되살린다", () => {
    const [svg] = buildSvgPages(pageOf(line), { measure: ko });

    expect(svg.match(/<text /g)).toHaveLength(1);
    expect(svg).toContain('<tspan >흡수가</tspan>');
    expect(svg).toContain('<tspan font-weight="800"> 빠른</tspan>');
    expect(svg).toContain('<tspan > 콜로이드 미네랄</tspan>');
    // 공백은 이 줄의 유일한 간격 장치다 — 접히거나 잘리면 안 된다.
    expect(svg).toContain('xml:space="preserve"');
    // 뒤따르는 런은 좌표로 고정되지 않는다 (그래야 폰트가 바뀌어도 안 겹친다).
    expect(svg).not.toContain('x="206"');
    expect(svg).not.toContain('x="259"');
  });

  it("작은 각주 런도 같은 줄이면 함께 흐른다", () => {
    const [svg] = buildSvgPages(
      pageOf([
        run({ id: "b", text: "높은 미네랄 함량", x: 131, width: 176, fontWeight: "800" }),
        run({
          id: "note",
          text: "[*고장성 온천]",
          x: 315,
          y: 111,
          width: 88,
          height: 18,
          fontSize: 15,
          lineHeight: "25.5px",
          fill: "rgb(110, 104, 98)",
        }),
      ]),
      { measure: ko },
    );

    expect(svg.match(/<text /g)).toHaveLength(1);
    expect(svg).toContain('font-size="15"');
    expect(svg).toContain("[*고장성 온천]");
  });

  it("위로 띄운 첨자는 합치지 않는다 (베이스라인이 다르다)", () => {
    const [svg] = buildSvgPages(
      pageOf([
        run({ id: "base", text: "트러블", x: 131, width: 76 }),
        run({ id: "sup", text: "*", x: 209, y: 92, width: 8, height: 12, fontSize: 11 }),
      ]),
      { measure: ko },
    );

    expect(svg.match(/<text /g)).toHaveLength(2);
    expect(svg).toContain('x="209"'); // 제 자리를 지킨다
  });

  it("letter-spacing을 px로 환산해 내보낸다 (Canvas 값은 em)", () => {
    const [svg] = buildSvgPages(pageOf(line), { measure: ko });
    // -0.0133em * 27px = -0.36px. 숫자를 그대로 두면 SVG는 px로 읽어 자간이 사라진다.
    expect(svg).toContain('letter-spacing="-0.36"');
  });
});
