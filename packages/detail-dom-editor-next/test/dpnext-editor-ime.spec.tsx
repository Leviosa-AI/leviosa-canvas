// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TextEditor } from "../src";

describe("dpnext Korean IME", () => {
  it("does not commit partial composition and commits the completed syllable", () => {
    const commit = vi.fn();
    render(<TextEditor value="" onCommit={commit} aria-label="제목 편집" />);
    const editor = screen.getByRole("textbox", { name: "제목 편집" });
    fireEvent.compositionStart(editor);
    editor.textContent = "ㅎ";
    fireEvent.input(editor);
    editor.textContent = "한";
    fireEvent.input(editor);
    expect(commit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(editor, { data: "한" });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenLastCalledWith("한");
  });
});

describe("dpnext text line breaks", () => {
  it("commits contentEditable <div>/<br> lines as \\n instead of flattening them", () => {
    const commit = vi.fn();
    render(<TextEditor value="" onCommit={commit} aria-label="본문 편집" />);
    const editor = screen.getByRole("textbox", { name: "본문 편집" });
    editor.innerHTML = "첫 줄<div>둘째 줄</div><div><br></div><div>넷째 줄</div>";
    fireEvent.input(editor);
    expect(commit).toHaveBeenLastCalledWith("첫 줄\n둘째 줄\n\n넷째 줄");
    editor.innerHTML = "a<br>b<br><br>";
    fireEvent.input(editor);
    expect(commit).toHaveBeenLastCalledWith("a\nb\n");
  });
});
