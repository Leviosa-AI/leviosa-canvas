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
