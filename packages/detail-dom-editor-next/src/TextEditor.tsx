// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { useRef } from "react";

interface TextEditorProps {
  value: string;
  onCommit: (value: string) => void;
  "aria-label"?: string;
}

// contentEditable 이 Enter 로 만드는 <div>·<p>·<br> 을 "\n" 으로 읽는다. textContent 는 줄바꿈을 버린다.
export function editableText(root: Node): string {
  let text = "";
  for (const child of root.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent ?? "";
    } else if (child.nodeName === "BR") {
      // 블록 끝의 <br> 은 빈 줄 자리표시자다.
      if (child.nextSibling) text += "\n";
    } else {
      if ((child.nodeName === "DIV" || child.nodeName === "P") && child.previousSibling) text += "\n";
      text += editableText(child);
    }
  }
  return text;
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
        draft.current = editableText(event.currentTarget);
        onCommit(draft.current);
      }}
      onInput={(event) => {
        draft.current = editableText(event.currentTarget);
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
