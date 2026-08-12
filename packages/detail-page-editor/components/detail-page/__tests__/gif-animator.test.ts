import { describe, expect, it } from "vitest";

import { findImageNode, gifElementIds } from "../gif-animator";

describe("gifElementIds — 재생 대상 GIF 수집", () => {
  it("custom.detailPageGif와 .gif src를 모두 잡고, 일반 이미지·텍스트는 제외", () => {
    const pages = [
      {
        children: [
          { id: "a", type: "image", src: "x.png" },
          { id: "b", type: "image", src: "y.gif" },
          { id: "c", type: "image", src: "blob:z", custom: { detailPageGif: true } },
          { id: "t", type: "text" },
        ],
      },
    ];
    expect(gifElementIds(pages)).toEqual(["b", "c"]);
  });

  it("그룹 안의 GIF도 재귀로 수집", () => {
    const pages = [
      {
        children: [
          {
            id: "g",
            type: "group",
            children: [{ id: "inner", type: "image", src: "a.gif" }],
          },
        ],
      },
    ];
    expect(gifElementIds(pages)).toEqual(["inner"]);
  });

  it("숨김(visible:false)·src 없음은 제외", () => {
    const pages = [
      {
        children: [
          { id: "hidden", type: "image", src: "a.gif", visible: false },
          { id: "nosrc", type: "image", custom: { detailPageGif: true } },
          { id: "ok", type: "image", src: "b.gif" },
        ],
      },
    ];
    expect(gifElementIds(pages)).toEqual(["ok"]);
  });

  it("페이지 없으면 빈 배열", () => {
    expect(gifElementIds(undefined)).toEqual([]);
    expect(gifElementIds([])).toEqual([]);
  });
});

/**
 * 엔진은 요소 하나를 `id` 를 단 Group 으로 감싸고 그 안에 이미지 노드를 둔다. id 로 찾은
 * 노드를 그대로 이미지로 여기면 `image()` 가 없어 프레임을 갈아 끼울 수 없고, 증상은
 * "GIF 가 보이는데 안 움직인다"로만 나타난다.
 */
describe("findImageNode — 그룹 안의 이미지 노드까지 내려간다", () => {
  const imageNode = (id: string) => ({ id, image: () => null });
  const stageWith = (byId: Record<string, unknown>) =>
    ({
      findOne(selector: string) {
        return byId[selector] ?? undefined;
      },
    }) as never;

  it("id로 찾은 노드가 이미지면 그대로 쓴다", () => {
    const node = imageNode("a");
    expect(findImageNode("a", [stageWith({ "#a": node })])).toBe(node);
  });

  it("id로 찾은 노드가 그룹이면 안의 이미지 자식을 쓴다", () => {
    const inner = imageNode("inner");
    const group = { findOne: (sel: string) => (sel === "Image" ? inner : undefined) };
    expect(findImageNode("a", [stageWith({ "#a": group })])).toBe(inner);
  });

  it("이미지 자식이 없는 그룹이면 null", () => {
    const group = { findOne: () => undefined };
    expect(findImageNode("a", [stageWith({ "#a": group })])).toBeNull();
  });

  it("어느 stage에도 없으면 null", () => {
    expect(findImageNode("a", [stageWith({})])).toBeNull();
    expect(findImageNode("a", [])).toBeNull();
  });
});
