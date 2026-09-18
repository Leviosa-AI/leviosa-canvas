// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { defineConfig } from "vite";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  base: "/detail-page-next-lab/",
  server: { host: "127.0.0.1", port: 4179, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
