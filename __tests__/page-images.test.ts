/**
 * 페이지 한 장이 그릴 그림의 주소 모으기.
 *
 * 썸네일을 굽기 전에 기다릴 목록이다. 여기서 하나라도 빠지면 그 사진만 빠진 채로
 * 구워지고, 사용자에게는 "미리보기에 사진이 안 나온다"로 보인다.
 */

import { describe, expect, it } from "vitest";

import { pageImageSources } from "@/lib/leviosa-canvas/render/page-images";

const SVG = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>')}`;

describe("pageImageSources", () => {
  it("사진과 svg를 모두 센다", () => {
    expect(
      pageImageSources({
        children: [
          { type: "image", src: "/a.jpg" },
          { type: "svg", src: SVG },
          { type: "text" },
        ],
      }),
    ).toEqual(["/a.jpg", SVG]);
  });

  it("그룹 안쪽까지 판다", () => {
    expect(
      pageImageSources({
        children: [
          { type: "group", children: [{ type: "image", src: "/deep.jpg" }] },
        ],
      }),
    ).toEqual(["/deep.jpg"]);
  });

  it("안 보이는 요소는 안 센다 — 그리지도 않는다", () => {
    expect(
      pageImageSources({
        children: [{ type: "image", src: "/hidden.jpg", visible: false }],
      }),
    ).toEqual([]);
  });

  it("같은 주소는 한 번만", () => {
    expect(
      pageImageSources({
        children: [
          { type: "image", src: "/same.jpg" },
          { type: "image", src: "/same.jpg" },
        ],
      }),
    ).toEqual(["/same.jpg"]);
  });

  it("주소가 빈 사진은 디컴포저가 남긴 목업을 본다", () => {
    // `ImageBody`가 그렇게 그린다 — 목업이 보이는데 썸네일에서 빠지면 안 된다.
    expect(
      pageImageSources({
        children: [
          {
            type: "image",
            src: "",
            custom: { placeholderBgImage: 'url("/mock.jpg")' },
          },
        ],
      }),
    ).toEqual(["/mock.jpg"]);
  });

  it("색을 갈아 끼운 svg는 바뀐 주소로 본다", () => {
    const [only] = pageImageSources({
      children: [{ type: "svg", src: SVG, colorsReplace: { "#000000": "#ff0000" } }],
    });
    expect(only).not.toBe(SVG);
    expect(atob(only.split(",")[1])).toContain("#ff0000");
  });
});
