// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
/**
 * 화면 = 내보내기. 화면(렌더러)이 그리는 자르기·회전·형광펜·자간이 PSD/SVG/AI에서
 * 빠지던 회귀를 막는다(docs/editor-audit-2026-09-28.md 5·6·7, 내보내기 절).
 */
import { describe, expect, it, vi } from "vitest";

import { buildAiPdf } from "../ai";
import type { ExportDocument, ExportElement } from "../document-model";
import { buildPsd, PsdTooLargeError } from "../psd";
import { drawBitmap, type Raster2D } from "../raster";
import { buildSvgDocument } from "../svg";

type Call = { name: string; args: unknown[] };

/** 부른 것을 전부 적어 두는 2D 컨텍스트. */
function recordingCtx(calls: Call[] = []): Raster2D {
  const gradient = { addColorStop: () => undefined } as unknown as CanvasGradient;
  const target: Record<string, unknown> = {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    textAlign: "left",
    textBaseline: "alphabetic",
    measureText: (s: string) => ({ width: s.length * 10 }) as TextMetrics,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  return new Proxy(target, {
    get(obj, key: string) {
      if (key in obj) return obj[key];
      return (...args: unknown[]) => {
        calls.push({ name: key, args });
      };
    },
  }) as unknown as Raster2D;
}

const measure = (_el: ExportElement, s: string) => s.length * 10;

const page = (children: ExportElement[]): ExportDocument => ({
  width: 400,
  height: 300,
  pages: [{ id: "p1", width: 400, height: 300, children }],
});

// 원본 200×100 중 오른쪽 절반(x 50%~100%)을 100×100 상자에 — 상자와 자른 영역 비율이 같다.
const cropped: ExportElement = {
  id: "photo",
  type: "image",
  src: "data:image/png;base64,AAAA",
  x: 10,
  y: 20,
  width: 100,
  height: 100,
  cropX: 0.5,
  cropY: 0,
  cropWidth: 0.5,
  cropHeight: 1,
};

describe("image crop", () => {
  it("raster drawBitmap cuts the document crop out of the source", () => {
    const calls: Call[] = [];
    drawBitmap(recordingCtx(calls), cropped, { width: 200, height: 100 });
    const draw = calls.find((c) => c.name === "drawImage");
    // 9-인자 drawImage: 원본 (100,0,100,100) → 상자 (10,20,100,100).
    expect(draw?.args.slice(1)).toEqual([100, 0, 100, 100, 10, 20, 100, 100]);
  });

  it("svg crops through a nested viewBox over the whole source", () => {
    const svg = buildSvgDocument(page([cropped]), {
      measure,
      imageSize: () => ({ width: 200, height: 100 }),
    });
    expect(svg).toContain('viewBox="100 0 100 100"');
    expect(svg).toContain('<image href="data:image/png;base64,AAAA" width="200" height="100"');
  });

  it("psd image layers draw through the same crop", async () => {
    const calls: Call[] = [];
    await buildPsd(page([cropped]), {
      createCanvas: (width, height) => ({ width, height, getContext: () => recordingCtx(calls) }),
      loadBitmap: async () => ({ width: 200, height: 100 }),
    });
    const draw = calls.find((c) => c.name === "drawImage" && c.args.length === 9);
    expect(draw?.args.slice(1, 5)).toEqual([100, 0, 100, 100]);
  });
});

describe("rotation", () => {
  const rotatedText: ExportElement = {
    id: "t",
    type: "text",
    text: "hi",
    x: 50,
    y: 60,
    width: 100,
    height: 20,
    fontSize: 16,
    rotation: 90,
  };

  it("svg rotates shapes, text and images around their own origin", () => {
    const svg = buildSvgDocument(
      page([
        rotatedText,
        { id: "r", type: "figure", x: 5, y: 6, width: 10, height: 10, fill: "#f00", rotation: 30 },
        { id: "img", type: "image", src: "a.png", x: 10, y: 20, width: 100, height: 100, rotation: 45 },
      ]),
      { measure },
    );
    expect(svg).toMatch(/<text[^>]*transform="rotate\(90 50 60\)"/);
    expect(svg).toMatch(/<rect[^>]*transform="rotate\(30 5 6\)"/);
    expect(svg).toMatch(/<image[^>]*transform="rotate\(45 10 20\)"/);
  });

  it("svg carries a moved/rotated group onto its children", () => {
    const svg = buildSvgDocument(
      page([
        {
          id: "g",
          type: "group",
          x: 30,
          y: 40,
          rotation: 15,
          children: [{ id: "c", type: "figure", x: 0, y: 0, width: 5, height: 5, fill: "#000" }],
        },
      ]),
      { measure },
    );
    expect(svg).toContain('transform="translate(30 40) rotate(15)"');
  });

  it("psd text transform carries the rotation (composed with the group)", async () => {
    const psd = await buildPsd(
      page([{ id: "g", type: "group", x: 0, y: 100, children: [rotatedText] }]),
      { createCanvas: (width, height) => ({ width, height, getContext: () => recordingCtx() }) },
    );
    const group = psd.children?.[0].children?.[0];
    const text = group?.children?.[0].text;
    const [a, b, c, d, tx, ty] = text?.transform ?? [];
    expect([a, b, c, d].map((v) => Math.round(v))).toEqual([0, 1, -1, 0]);
    expect([tx, ty]).toEqual([50, 160]);
  });
});

describe("text highlight band", () => {
  const marked: ExportElement = {
    id: "m",
    type: "text",
    text: "형광펜",
    x: 10,
    y: 10,
    width: 200,
    height: 30,
    fontSize: 20,
    custom: { highlightColor: "#ffeb3b" },
  };

  it("svg draws the band behind the text", () => {
    const svg = buildSvgDocument(page([marked]), { measure });
    const band = svg.indexOf('fill="#ffeb3b"');
    expect(band).toBeGreaterThan(-1);
    expect(band).toBeLessThan(svg.indexOf("<text"));
  });

  it("psd puts the band on its own layer under the editable text", async () => {
    const psd = await buildPsd(page([marked]), {
      createCanvas: (width, height) => ({ width, height, getContext: () => recordingCtx() }),
    });
    expect(psd.children?.[0].children?.map((l) => l.name)).toEqual(["m highlight", "m"]);
  });

  it("ai fills the band before showing the text", async () => {
    const bytes = await buildAiPdf(page([marked]), {
      measure,
      loadBitmap: vi.fn(async () => null),
      merged: true,
    });
    const content = new TextDecoder("latin1").decode(bytes);
    const band = content.indexOf("1 0.922 0.231 rg");
    expect(band).toBeGreaterThan(-1);
    expect(band).toBeLessThan(content.indexOf("BT"));
  });
});

describe("psd text details", () => {
  it("reads letterSpacing as em (fontSize × em), like the screen", async () => {
    const psd = await buildPsd(
      page([
        { id: "t", type: "text", text: "a", x: 0, y: 0, width: 50, height: 20, fontSize: 20, letterSpacing: 0.1 },
      ]),
      { createCanvas: (width, height) => ({ width, height, getContext: () => recordingCtx() }) },
    );
    // 0.1em = 2px → Photoshop tracking 100 (1/1000 em). px로 읽으면 5가 나왔다.
    expect(psd.children?.[0].children?.[0].text?.style?.tracking).toBe(100);
  });

  it("throws a typed error past the PSD size limit", async () => {
    const tall: ExportDocument = { width: 100, height: 40000, pages: [{ id: "p", height: 40000 }] };
    const error = await buildPsd(tall, {
      createCanvas: (width, height) => ({ width, height, getContext: () => recordingCtx() }),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PsdTooLargeError);
    expect((error as PsdTooLargeError).code).toBe("PSD_TOO_LARGE");
  });
});
