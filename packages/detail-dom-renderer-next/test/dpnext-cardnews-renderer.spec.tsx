import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DetailDocumentV2 } from "../../detail-document-next/src";
import { collectDocumentFonts, DocumentRenderer } from "../src";

const document: DetailDocumentV2 = {
  schema_version: "detail-document-v2",
  document_kind: "cardnews",
  document_id: "dpnd_cardnews_fixture",
  revision: 0,
  canvas: { width: 1080, height: 1350, background: "#101010" },
  sections: [{
    id: "slide_cover",
    type: "section",
    layout: { mode: "overlay", width: 1080, height: 1350 },
    children: [{
      id: "headline",
      type: "text",
      content: "브랜드의 한 문장",
      marks: [
        { text: "브랜드", color: "#FFFFFF", highlight_color: "#FFD600" },
        { text: "의 한 문장", color: "#FFFFFF" },
      ],
      layout: { mode: "absolute", x: 80, y: 120, width: 920, height: 220, zIndex: 3 },
      style: { fontSize: 72, fontFamily: "Pretendard", fontWeight: "800" },
    }, {
      id: "clip",
      type: "video",
      assetId: "asset_clip",
      alt: "제품 사용 영상",
      layout: { mode: "absolute", x: 0, y: 0, width: 1080, height: 1350, zIndex: 1 },
      style: { objectFit: "cover", objectPosition: "25% 70%" },
    }, {
      id: "sparkles",
      type: "particles",
      particles: { shape: "star", count: 5, seed: 42, colors: ["#FFFFFF", "#FFD600"] },
      layout: { mode: "absolute", x: 0, y: 0, width: 1080, height: 300, zIndex: 4 },
    }],
  }],
  assets: {
    asset_clip: {
      kind: "video",
      uri: "asset://cardnews/clip",
      mimeType: "video/mp4",
      sha256: "a".repeat(64),
      width: 1080,
      height: 1350,
    },
  },
};

describe("dpnext cardnews renderer", () => {
  it("renders fixed slide media, segmented text, and deterministic particles without canvas", () => {
    const { container } = render(
      <DocumentRenderer document={document} resolveAsset={() => "/assets/clip.mp4"} />,
    );
    const root = container.querySelector("main");
    expect(root).toHaveStyle({ width: "1080px", height: "1350px" });
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("video")).toHaveAttribute("src", "/assets/clip.mp4");
    expect(container.querySelector("[data-dpnext-node-id='headline'] span")).toHaveStyle({
      background: "rgb(255, 214, 0)",
    });
    expect(container.querySelectorAll("[data-dpnext-node-id='sparkles'] i")).toHaveLength(5);
  });

  it("declares frozen-font preload requirements without fetching", () => {
    expect(collectDocumentFonts(document)).toEqual([
      { family: "Pretendard", weights: ["800"] },
    ]);
  });

  it("uses the cardnews run-length segment and mulberry32 particle contracts", () => {
    const partial: DetailDocumentV2 = {
      ...document,
      document_id: "dpnd_cardnews_partial",
      sections: [{
        ...document.sections[0],
        children: [{
          id: "partial-headline",
          type: "text",
          content: "브랜드의 한 문장",
          marks: [
            { kind: "cardnews_text_highlight", color: "#00FF00", radius: 0.2, pad_x: 0.1 },
            { text: "브랜드", font_size: 88, highlight_color: "#FFD600" },
          ],
          layout: { mode: "absolute", x: 0, y: 0, width: 900, height: 200 },
        }, {
          id: "seeded",
          type: "particles",
          particles: { shape: "star", count: 1, seed: 42, colors: ["#FFFFFF", "#FFD600"] },
          layout: { mode: "absolute", x: 0, y: 0, width: 1080, height: 300 },
        }],
      }],
    };

    const { container } = render(
      <DocumentRenderer document={partial} resolveAsset={() => ""} />,
    );
    const segment = container.querySelector("[data-dpnext-node-id='partial-headline'] span span");
    expect(segment).toHaveTextContent("브랜드");
    expect(segment).toHaveStyle({ background: "rgb(255, 214, 0)" });
    expect(segment).toHaveStyle({ fontSize: "88px" });
    expect(container.querySelector("[data-dpnext-text-highlight='true']")).toHaveTextContent("브랜드의 한 문장");
    const particle = container.querySelector("[data-dpnext-node-id='seeded'] i");
    expect(particle).toHaveStyle({
      left: "649.1920520737767px",
      top: "134.4871676992625px",
      width: "12.819726347923279px",
      background: "rgb(255, 214, 0)",
      transform: "translate(-50%, -50%) rotate(0deg)",
    });
  });
});
