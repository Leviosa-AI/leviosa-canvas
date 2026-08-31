import { describe, expect, it } from "vitest";

import { quickActions } from "../selection-actions";

/**
 * 띠에 무엇이 뜨는가는 규칙이지 그림이 아니다. 예전에는 같은 판단이 우측 패널 JSX 안에
 * 조건문으로 흩어져 있어서 "왜 이 버튼이 안 뜨지"를 화면을 띄워야 답할 수 있었다.
 */

const image = { id: "i1", type: "image", src: "https://s3/a.png" };
const text = { id: "t1", type: "text" };

describe("quickActions", () => {
  it("고른 것이 없으면 아무것도 안 띄운다", () => {
    expect(quickActions([])).toEqual([]);
  });

  it("사진 하나면 자르기가 맨 앞이다", () => {
    expect(quickActions([image])).toEqual(["crop", "promptEdit", "more"]);
  });

  it("배경 지우기는 배선돼 있을 때만", () => {
    expect(quickActions([image], { canRemoveBackground: true })).toEqual([
      "crop",
      "bgRemove",
      "promptEdit",
      "more",
    ]);
  });

  it("주소가 없는 사진은 자를 것도 고칠 것도 없다", () => {
    expect(quickActions([{ id: "i2", type: "image" }])).toEqual(["more"]);
  });

  it("GIF는 프레임 그림이라 자르기·배경 지우기를 안 띄운다", () => {
    const gif = { id: "g1", type: "image", src: "https://s3/a.gif" };
    expect(quickActions([gif], { canRemoveBackground: true, hasGeneration: true })).toEqual([
      "promptEdit",
      "more",
    ]);
    const marked = { id: "g2", type: "image", src: "x", custom: { detailPageGif: true } };
    expect(quickActions([marked], { canRemoveBackground: true })).toEqual([
      "promptEdit",
      "more",
    ]);
  });

  it("그림 편집은 문서 없이도 뜬다 — 캐러셀이 그렇다", () => {
    // 그림과 지시가 요청에 다 실려 가고, 결과는 브랜드 자산으로 돌아온다.
    expect(quickActions([image])).toContain("promptEdit");
  });

  it("글·도형 편집은 서버가 아는 문서가 있어야 뜬다", () => {
    // 이쪽은 서버가 문서를 읽고 고쳐서 돌려준다.
    expect(quickActions([text])).toEqual(["more"]);
    expect(quickActions([text], { hasGeneration: true })).toEqual([
      "promptEdit",
      "more",
    ]);
  });

  it("그룹은 안에 고칠 것이 있어야 뜬다", () => {
    const empty = { id: "g1", type: "group", children: [{ id: "i1", type: "image" }] };
    const filled = {
      id: "g2",
      type: "group",
      children: [{ id: "sub", type: "group", children: [text] }],
    };
    expect(quickActions([empty], { hasGeneration: true })).toEqual(["more"]);
    expect(quickActions([filled], { hasGeneration: true })).toEqual([
      "promptEdit",
      "more",
    ]);
  });

  it("여럿을 골랐으면 공통 동작만 남는다", () => {
    expect(
      quickActions([image, text], { hasGeneration: true, canRemoveBackground: true }),
    ).toEqual(["more"]);
  });
});
