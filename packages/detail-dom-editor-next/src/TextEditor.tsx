// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { useRef } from "react";

interface TextEditorProps {
  value: string;
  onCommit: (value: string) => void;
  "aria-label"?: string;
}

export function TextEditor({ value, onCommit, "aria-label": ariaLabel }: TextEditorProps) {
  const composing = useRef(false);
  const draft = useRef(value);
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel ?? "텍스트 편집"}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={(event) => {
        composing.current = false;
        draft.current = event.currentTarget.textContent ?? "";
        onCommit(draft.current);
      }}
      onInput={(event) => {
        draft.current = event.currentTarget.textContent ?? "";
        if (!composing.current) onCommit(draft.current);
      }}
      onBlur={() => {
        if (!composing.current) onCommit(draft.current);
      }}
    >
      {value}
    </div>
  );
}
