import { describe, expect, it } from "vitest";

import type { ExportDocument } from "../document-model";
import { buildPsd, fontPostScriptName, PSD_MAX_DIMENSION } from "../psd";
import type { Raster2D } from "../raster";

/**
 * jsdom has no working 2D context, so tests inject a recording stub — the
 * builder only needs measureText plus no-op drawing calls to produce the
 * layer tree we assert on.
 */
function stubCtx(): Raster2D {
  const noop = () => undefined;
  const gradient = { addColorStop: noop } as unknown as CanvasGradient;
  return {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    textAlign: "left",
    textBaseline: "alphabetic",
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    rect: noop,
    moveTo: noop,
    lineTo: noop,
    arcTo: noop,
    ellipse: noop,
    clip: noop,
    translate: noop,
    scale: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    fillText: noop,
    measureText: (s: string) => ({ width: s.length * 10 }) as TextMetrics,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    drawImage: noop,
  } as unknown as Raster2D;
}

const createCanvas = (width: number, height: number) => ({
  width,
  height,
  getContext: () => stubCtx(),
});

const fixture: ExportDocument = {
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
          id: "r1",
          type: "figure",
          subType: "rect",
          x: 10,
          y: 10,
          width: 100,
          height: 50,
          fill: "rgb(255, 0, 0)",
          cornerRadius: 8,
        },
        {
          id: "g1",
          type: "group",
          x: 10,
          y: 80,
          width: 200,
          height: 60,
          children: [
            {
              id: "t1",
              type: "text",
              x: 10,
              y: 80,
              width: 200,
              height: 30,
              text: "안녕하세요",
              fontSize: 20,
              fontFamily: "Pretendard",
              fontWeight: 700,
              fill: "rgb(0, 0, 0)",
              lineHeight: 1.4,
              align: "left",
            },
          ],
        },
        { id: "hidden", type: "figure", x: 0, y: 0, width: 10, height: 10, visible: false },
      ],
    },
    { id: "page-2", background: "white", width: 400, height: 200, children: [] },
  ],
};

describe("buildPsd", () => {
  it("stacks pages into groups and maps elements to layers", async () => {
    const psd = await buildPsd(fixture, {
      createCanvas,
      slotBindings: { "p1.title": { element_id: "t1" } },
    });
    expect(psd.width).toBe(400);
    expect(psd.height).toBe(500); // 300 + 200 stacked

    const [page1, page2] = psd.children ?? [];
    expect(page1.name).toBe("p01 page-1");
    // background + figure + group; visible:false is dropped
    expect(page1.children?.map((l) => l.name)).toEqual(["background", "r1", "g1"]);
    // Named CSS colors ('white', the stock editor's default) still paint a background.
    expect(page2.children?.map((l) => l.name)).toEqual(["background"]);

    const group = page1.children?.find((l) => l.children);
    const textLayer = group?.children?.[0];
    expect(textLayer?.name).toBe("p1.title"); // slot binding names the layer
    expect(textLayer?.text?.text).toBe("안녕하세요");
    expect(textLayer?.text?.style?.font?.name).toBe("Pretendard-Bold");
    expect(textLayer?.text?.style?.leading).toBe(28);
    expect(JSON.stringify(psd.children)).not.toContain("NaN");
  });

  it("positions layers on the stacked page offset", async () => {
    const psd = await buildPsd(
      {
        width: 100,
        height: 100,
        pages: [
          { id: "a", width: 100, height: 100, children: [] },
          {
            id: "b",
            width: 100,
            height: 100,
            children: [{ id: "f", type: "figure", x: 5, y: 7, width: 10, height: 10 }],
          },
        ],
      },
      { createCanvas },
    );
    const figure = psd.children?.[1]?.children?.[0];
    expect(figure?.top).toBe(107); // second page starts at y=100
    expect(figure?.left).toBe(5);
  });

  it("exports only the requested pages, keeping document order", async () => {
    const psd = await buildPsd(fixture, { createCanvas, pageIds: ["page-2"] });
    expect(psd.height).toBe(200);
    expect(psd.children?.length).toBe(1);
  });

  it("stores catalog fonts by their real PostScript name with a raster cache", async () => {
    const psd = await buildPsd(
      {
        width: 200,
        height: 80,
        pages: [
          {
            id: "p",
            children: [
              {
                id: "catalog-text",
                type: "text",
                text: "페이퍼로지",
                fontFamily: "Paperozi",
                fontWeight: 600,
                fontStyle: "italic",
                fontSize: 20,
                x: 0,
                y: 0,
                width: 180,
                height: 40,
              },
            ],
          },
        ],
      },
      {
        createCanvas,
        fontPostScriptNames: [
          {
            spec: { family: "Paperozi", weight: 600, italic: false },
            name: "Paperlogy-6SemiBold",
          },
        ],
      },
    );
    const layer = psd.children?.[0]?.children?.[0];
    expect(layer?.text?.style?.font?.name).toBe("Paperlogy-6SemiBold");
    expect(layer?.text?.style?.fauxItalic).toBe(true);
    expect(layer?.canvas).toBeDefined();
  });

  it("rejects documents beyond the PSD size limit", async () => {
    const tall: ExportDocument = {
      width: 100,
      height: PSD_MAX_DIMENSION + 1,
      pages: [{ id: "a", width: 100, height: PSD_MAX_DIMENSION + 1, children: [] }],
    };
    await expect(buildPsd(tall, { createCanvas })).rejects.toThrow(/exceeds the PSD limit/);
  });
});

describe("fontPostScriptName", () => {
  it("maps CSS weights to Pretendard static names", () => {
    expect(fontPostScriptName("Pretendard", 400)).toBe("Pretendard-Regular");
    expect(fontPostScriptName("Pretendard", "600")).toBe(
      "Pretendard-SemiBold",
    );
    expect(fontPostScriptName("Pretendard", 700)).toBe("Pretendard-Bold");
    expect(fontPostScriptName("Pretendard", 800)).toBe(
      "Pretendard-ExtraBold",
    );
    expect(fontPostScriptName(undefined, undefined)).toBe(
      "Pretendard-Regular",
    );
  });

  it("uses the real catalog PostScript name and nearest available face", () => {
    const names = [
      {
        spec: { family: "Paperozi", weight: 600, italic: false },
        name: "Paperlogy-6SemiBold",
      },
    ];
    expect(fontPostScriptName("Paperozi", 600, false, names)).toBe(
      "Paperlogy-6SemiBold",
    );
    expect(fontPostScriptName("Paperozi", 650, false, names)).toBe(
      "Paperlogy-6SemiBold",
    );
    expect(fontPostScriptName("Paperozi", 650, true, names)).toBe(
      "Paperlogy-6SemiBold",
    );
  });
});

/**
 * Hiding a layer with the eye toggle is an editorial decision, so it must not
 * export — including when the hidden layer sits INSIDE a group, which is where
 * users actually hide things (the group itself stays, its hidden child does not).
 */
describe("buildPsd — hidden group children", () => {
  it("drops a hidden child but keeps its visible siblings", async () => {
    const doc: ExportDocument = {
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
              id: "g1",
              type: "group",
              x: 0,
              y: 0,
              width: 200,
              height: 60,
              children: [
                { id: "kept", type: "figure", x: 0, y: 0, width: 10, height: 10 },
                {
                  id: "child-hidden",
                  type: "figure",
                  x: 0,
                  y: 20,
                  width: 10,
                  height: 10,
                  visible: false,
                },
              ],
            },
          ],
        },
      ],
    };

    const psd = await buildPsd(doc, { createCanvas });
    const page = psd.children?.[0];
    const group = page?.children?.find((l) => l.children);
    expect(group?.children?.map((l) => l.name)).toEqual(["kept"]);
  });
});
