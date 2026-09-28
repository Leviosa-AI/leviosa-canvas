// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { describe, expect, it } from "vitest";

import { CANVAS_CLIPBOARD_MARK, planPaste } from "../canvas-paste";

function data(text: string, files: File[] = []) {
  return {
    getData: (type: string) => (type === "text/plain" ? text : ""),
    files: files as unknown as FileList,
  };
}

const png = new File(["x"], "a.png", { type: "image/png" });

describe("planPaste", () => {
  it("우리 표식이면 엔진 클립보드 — 방금 편집기에서 복사한 것", () => {
    // 이미지 ⌘C 는 PNG 와 표식을 같이 적는다. 그림을 다시 올리지 않는다.
    expect(planPaste(data(CANVAS_CLIPBOARD_MARK, [png]), true)).toEqual({ kind: "engine" });
  });

  it("다른 앱의 그림은 올려서 넣는다", () => {
    expect(planPaste(data("", [png]), true)).toEqual({ kind: "files", files: [png] });
  });

  it("올릴 수 없으면 그림은 건너뛰고 글자를 본다", () => {
    expect(planPaste(data("안녕", [png]), false)).toEqual({ kind: "text", text: "안녕" });
  });

  it("그림이 아닌 파일은 안 받는다", () => {
    const pdf = new File(["x"], "a.pdf", { type: "application/pdf" });
    expect(planPaste(data("", [pdf]), true)).toEqual({ kind: "engine" });
  });

  it("아무것도 없으면 엔진 클립보드(다른 탭에서 복사한 요소)", () => {
    expect(planPaste(data("  "), true)).toEqual({ kind: "engine" });
    expect(planPaste(null, true)).toEqual({ kind: "engine" });
  });
});
