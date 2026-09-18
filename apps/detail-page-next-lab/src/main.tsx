// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { LabApp } from "./LabApp";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LabApp />
  </StrictMode>,
);
