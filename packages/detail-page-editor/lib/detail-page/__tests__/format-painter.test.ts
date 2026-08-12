import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyFormat,
  canCopyFormat,
  canPasteFormat,
  copyFormat,
  formatToApply,
  heldFormat,
  holdFormat,
} from "../format-painter";

const HEADING = {
  type: "text",
  fontFamily: "Pretendard",
  fontSize: 44,
  fontWeight: "bold",
  fill: "#111111",
  letterSpacing: -0.02,
  lineHeight: 1.25,
  backgroundEnabled: true,
  backgroundColor: "#FFE9A8",
  opacity: 0.9,
  // 서식이 아닌 것들 — 절대 따라가면 안 된다.
  text: "성분이 다릅니다",
  width: 640,
  height: 120,
  x: 40,
  y: 200,
};

beforeEach(() => holdFormat(null));

describe("canCopyFormat", () => {
  it("텍스트·도형·svg·이미지는 된다", () => {
    for (const type of ["text", "figure", "svg", "image"]) {
      expect(canCopyFormat({ type })).toBe(true);
    }
  });

  it("그룹은 안 된다", () => {
    // 차트·표를 포함한 그룹은 자기 스펙이 모양을 정한다. 스톡 편집기의 useCopyStyle은
    // 여기서 map[undefined]를 집어 터진다.
    expect(canCopyFormat({ type: "group" })).toBe(false);
    expect(canCopyFormat(null)).toBe(false);
    expect(canCopyFormat({})).toBe(false);
  });
});

describe("copyFormat", () => {
  it("서식만 담고 내용·크기·좌표는 안 담는다", () => {
    // 스톡 편집기의 useCopyStyle은 공통 필드에 width·height가 있어 붙이면 크기가 바뀐다.
    const copied = copyFormat(HEADING)!;
    expect(copied.type).toBe("text");
    expect(copied.props).toMatchObject({
      fontFamily: "Pretendard",
      fontSize: 44,
      fill: "#111111",
      backgroundColor: "#FFE9A8",
      opacity: 0.9,
    });
    for (const key of ["text", "width", "height", "x", "y"]) {
      expect(copied.props).not.toHaveProperty(key);
    }
  });

  it("자르기(crop)는 서식이 아니다", () => {
    // 어디를 보여줄지는 그 사진의 내용이다.
    const copied = copyFormat({
      type: "image",
      cropX: 0.2,
      cropWidth: 0.5,
      cornerRadius: 12,
    })!;
    expect(copied.props).toEqual({ cornerRadius: 12 });
  });

  it("값이 없는 필드는 키 자체를 안 만든다", () => {
    // 담아 두면 나중에 붙일 때 대상의 멀쩡한 값을 undefined로 뭉갠다.
    const copied = copyFormat({ type: "text", fontSize: 20 })!;
    expect(copied.props).toEqual({ fontSize: 20 });
  });

  it("배열·객체는 떼어서 담는다", () => {
    // 같은 참조를 공유하면 한쪽 색을 고칠 때 원본도 바뀐다.
    const replace = [{ from: "#000", to: "#F00" }];
    const copied = copyFormat({ type: "svg", colorsReplace: replace })!;
    expect(copied.props.colorsReplace).toEqual(replace);
    expect(copied.props.colorsReplace).not.toBe(replace);
  });

  it("그룹은 null", () => {
    expect(copyFormat({ type: "group", opacity: 0.5 })).toBeNull();
  });
});

describe("formatToApply", () => {
  it("같은 타입이면 통째로 간다", () => {
    const copied = copyFormat(HEADING)!;
    expect(formatToApply(copied, { type: "text" })).toEqual(copied.props);
  });

  it("타입이 다르면 교집합만", () => {
    // 텍스트 서식을 도형에 붙이면 둘 다 아는 것(색·불투명도)만 옮고, 폰트·자간·
    // 하이라이트처럼 도형에 뜻이 없는 필드는 아예 안 간다.
    const copied = copyFormat(HEADING)!;
    expect(formatToApply(copied, { type: "figure" })).toEqual({
      opacity: 0.9,
      fill: "#111111",
    });
  });

  it("그룹에는 아무 것도 안 간다", () => {
    expect(formatToApply(copyFormat(HEADING)!, { type: "group" })).toEqual({});
    expect(formatToApply(copyFormat(HEADING)!, {})).toEqual({});
  });

  it("도형끼리는 색·선·라운드가 간다", () => {
    const copied = copyFormat({
      type: "figure",
      fill: "#F2F2F2",
      stroke: "#DDD",
      strokeWidth: 1.5,
      cornerRadius: 16,
    })!;
    expect(formatToApply(copied, { type: "figure" })).toEqual({
      fill: "#F2F2F2",
      stroke: "#DDD",
      strokeWidth: 1.5,
      cornerRadius: 16,
    });
  });
});

describe("canPasteFormat", () => {
  it("복사한 게 없으면 false", () => {
    expect(canPasteFormat(null, [{ type: "text" }])).toBe(false);
  });

  it("대상이 없으면 false", () => {
    expect(canPasteFormat(copyFormat(HEADING), [])).toBe(false);
  });

  it("먹일 게 하나도 없으면 false", () => {
    expect(canPasteFormat(copyFormat(HEADING), [{ type: "group" }])).toBe(false);
  });

  it("하나라도 먹을 게 있으면 true", () => {
    expect(
      canPasteFormat(copyFormat(HEADING), [{ type: "group" }, { type: "figure" }]),
    ).toBe(true);
  });
});

describe("applyFormat", () => {
  it("선택 전부에 먹이고 먹은 수를 돌려준다", () => {
    const a = { type: "text", set: vi.fn() };
    const b = { type: "figure", set: vi.fn() };
    const skipped = { type: "group", set: vi.fn() };
    expect(applyFormat(copyFormat(HEADING)!, [a, b, skipped])).toBe(2);
    expect(a.set).toHaveBeenCalledWith(
      expect.objectContaining({ fontSize: 44, fill: "#111111" }),
    );
    expect(b.set).toHaveBeenCalledWith({ opacity: 0.9, fill: "#111111" });
    expect(skipped.set).not.toHaveBeenCalled();
  });

  it("대상마다 다른 객체를 넘긴다", () => {
    // 같은 객체를 돌려 쓰면 mobx 모델 둘이 한 배열을 공유하게 된다.
    const copied = copyFormat({ type: "svg", colorsReplace: [{ from: "#000" }] })!;
    const a = { type: "svg", set: vi.fn() };
    const b = { type: "svg", set: vi.fn() };
    applyFormat(copied, [a, b]);
    const first = a.set.mock.calls[0][0].colorsReplace;
    const second = b.set.mock.calls[0][0].colorsReplace;
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});

describe("세션 클립보드", () => {
  it("담아 두고 꺼낸다", () => {
    expect(heldFormat()).toBeNull();
    const copied = copyFormat(HEADING);
    holdFormat(copied);
    expect(heldFormat()).toBe(copied);
    holdFormat(null);
    expect(heldFormat()).toBeNull();
  });
});
