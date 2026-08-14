import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { LabApp } from "./LabApp";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LabApp />
  </StrictMode>,
);
