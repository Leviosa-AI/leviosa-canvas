import { describe, expect, it } from "vitest";

import { buildTextGifPayload } from "../text-gif-payload";

describe("buildTextGifPayload", () => {
  it("줄·폰트를 snake_case 로 옮긴다", () => {
    const payload = buildTextGifPayload({
      text: "헤드라인",
      effect: "shimmer",
      color: "#17150f",
      background: "#f5f0e8",
      fontSize: 64,
      fontWeight: 800,
      fontFamily: "Paperozi",
      lines: [
        {
          text: "헤드라인",
          color: "#17150f",
          fontSize: 64,
          fontWeight: 800,
          fontFamily: "Paperozi",
        },
        {
          text: "부제",
          color: "#a08a63",
          fontSize: 24,
          fontWeight: 500,
          fontFamily: "Paperozi",
        },
      ],
      fonts: [{ family: "Paperozi", url: "https://cdn/x.woff2", weight: 700 }],
      brandId: "b1",
    });

    expect(payload.font_size).toBe(64);
    expect(payload.font_family).toBe("Paperozi");
    expect(payload.brand_id).toBe("b1");
    expect(payload.lines).toEqual([
      {
        text: "헤드라인",
        color: "#17150f",
        font_size: 64,
        font_weight: 800,
        font_family: "Paperozi",
      },
      {
        text: "부제",
        color: "#a08a63",
        font_size: 24,
        font_weight: 500,
        font_family: "Paperozi",
      },
    ]);
    expect(payload.fonts[0].url).toBe("https://cdn/x.woff2");
  });

  it("줄·폰트가 없으면 빈 배열로 보낸다", () => {
    const payload = buildTextGifPayload({ text: "가", effect: "wave" });
    expect(payload.lines).toEqual([]);
    expect(payload.fonts).toEqual([]);
  });
});
