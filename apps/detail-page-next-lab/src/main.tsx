import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { EditorSurface } from "../../../packages/detail-dom-editor-next/src";
import { placeholderAssetResolver } from "../../../packages/detail-dom-renderer-next/src";
import { fixture } from "./fixture";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <header>
      <strong>Detail Page Next</strong>
      <span>DOM renderer/editor lab · Konva 0</span>
    </header>
    <div className="lab-shell">
      <EditorSurface document={fixture} resolveAsset={placeholderAssetResolver} />
    </div>
  </StrictMode>,
);
