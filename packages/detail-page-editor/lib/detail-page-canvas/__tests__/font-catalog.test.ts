import { describe, expect, it, vi } from "vitest";

import {
  DETAIL_PAGE_FONTS,
  closestDetailPageFontWeight,
  getDetailPageFont,
  getDetailPageFontWeights,
  loadDetailPageFont,
  normalizeFontWeight,
} from "../font-catalog";

describe("detail-page font catalog", () => {
  it("keeps every initial font and its weight sources in one valid catalog", () => {
    expect(DETAIL_PAGE_FONTS).toHaveLength(22);
    expect(DETAIL_PAGE_FONTS.map((font) => font.family)).toEqual(
      expect.arrayContaining([
        "Paperozi",
        "Escoredream",
        "Presentation",
        "WantedSans",
        "MaruBuri",
        "Diphylleia",
        "ImFellEnglishSC",
        "BodoniModa",
        "Aggravo",
        "Cafe24Surround",
        "A2z",
        "Mona12",
        "KookminUniversitySunggokSerif",
        "RoundedFixedsys",
        "DaeguCatholicUniversity",
        "NexonMaplestory",
        "Galmuri9",
        "DungeonFighterOnlineBeatBeat",
        "D2Coding",
        "BookkMyungjo",
        "OngleipParkDahyeon",
        "PalchilmmDailyItalic",
      ]),
    );
    const ids = DETAIL_PAGE_FONTS.map((font) => font.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const font of DETAIL_PAGE_FONTS) {
      expect(font.licenseUrl).toMatch(/^https:\/\//);
      expect(font.styles.length).toBeGreaterThan(0);
      expect(font.styles.every((style) => style.url.startsWith("https://"))).toBe(true);
      // 같은 (weight, style) 이 둘이면 뒤쪽 face 는 영영 선택되지 않는다 — 원티드
      // 산스의 Black 과 ExtraBlack 은 둘 다 usWeightClass 900 이라 하나만 싣는다.
      const faces = font.styles.map((style) => `${style.weight}/${style.style}`);
      expect(new Set(faces).size).toBe(faces.length);
    }
  });

  it("normalizes legacy Canvas weights and chooses the nearest available face", () => {
    const aggro = getDetailPageFont("Aggravo");
    expect(aggro).toBeDefined();
    expect(normalizeFontWeight("bold")).toBe(700);
    expect(normalizeFontWeight("normal")).toBe(400);
    expect(getDetailPageFontWeights(aggro!)).toEqual([300, 500, 700]);
    expect(closestDetailPageFontWeight(aggro!, 400)).toBe(300);
    expect(closestDetailPageFontWeight(aggro!, 650)).toBe(700);
  });

  it("loads one exact face, caches it, and persists its CDN source in Canvas", async () => {
    const load = vi.fn(async function (this: FontFace) {
      return this;
    });
    const FontFaceMock = vi.fn(function (
      this: FontFace,
      family: string,
      source: string,
      descriptors: FontFaceDescriptors,
    ) {
      Object.assign(this, { family, source, descriptors, load });
    });
    vi.stubGlobal("FontFace", FontFaceMock);
    const add = vi.fn();
    const fontSetLoad = vi.fn().mockResolvedValue([]);
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { add, load: fontSetLoad },
    });
    const addFont = vi.fn();
    const store = { fonts: [], addFont };

    await loadDetailPageFont({
      family: "Paperozi",
      weight: 600,
      sample: "테스트",
      store,
    });
    await loadDetailPageFont({
      family: "Paperozi",
      weight: 600,
      sample: "테스트",
      store,
    });

    expect(FontFaceMock).toHaveBeenCalledTimes(1);
    expect(FontFaceMock).toHaveBeenCalledWith(
      "Paperozi",
      expect.stringContaining("Paperlogy-6SemiBold.woff2"),
      expect.objectContaining({ weight: "600" }),
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(addFont).toHaveBeenLastCalledWith({
      fontFamily: "Paperozi",
      styles: [
        expect.objectContaining({
          fontWeight: "600",
          src: expect.stringContaining("Paperlogy-6SemiBold.woff2"),
        }),
      ],
    });
  });
});
