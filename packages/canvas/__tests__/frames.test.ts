import { describe, expect, it } from "vitest";

import { frameOf, groupFrames } from "../render/frames";

const page = (id: string, frame?: string) => ({
  id,
  custom: frame === undefined ? undefined : { frame },
});

describe("frameOf", () => {
  it("꼬리표가 없으면 빈 프레임이다", () => {
    expect(frameOf(page("p1"))).toBe("");
    expect(frameOf({ custom: {} })).toBe("");
    expect(frameOf({ custom: { frame: 7 } })).toBe("");
  });

  it("꼬리표가 있으면 그 값이다", () => {
    expect(frameOf(page("p1", "A"))).toBe("A");
  });
});

describe("groupFrames", () => {
  // 이 저장소에 이미 있는 문서는 전부 꼬리표가 없다. 그것들이 한 열로 남아야
  // 지금까지 만들어진 문서의 그림이 안 바뀐다.
  it("꼬리표 없는 문서는 순서 그대로 한 열이다", () => {
    const pages = [page("p1"), page("p2"), page("p3")];
    expect(groupFrames(pages)).toEqual([{ key: "", pages }]);
  });

  it("꼬리표마다 열이 하나씩, 처음 나온 순서대로", () => {
    const [a1, b1, a2] = [page("p1", "A"), page("p2", "B"), page("p3", "A")];
    expect(groupFrames([a1, b1, a2])).toEqual([
      { key: "A", pages: [a1, a2] },
      { key: "B", pages: [b1] },
    ]);
  });

  it("꼬리표가 섞여 있으면 없는 쪽도 제 열을 갖는다", () => {
    const [bare, tagged] = [page("p1"), page("p2", "A")];
    expect(groupFrames([bare, tagged])).toEqual([
      { key: "", pages: [bare] },
      { key: "A", pages: [tagged] },
    ]);
  });

  it("빈 문서는 열이 없다", () => {
    expect(groupFrames([])).toEqual([]);
  });
});
