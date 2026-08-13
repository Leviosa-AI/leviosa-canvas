import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "dpnext-unit",
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: [
      "packages/detail-document-next/test/dpnext-*.spec.ts",
      "packages/detail-dom-renderer-next/test/dpnext-*.spec.tsx",
      "packages/detail-dom-editor-next/test/dpnext-*.spec.{ts,tsx}",
    ],
    pool: "forks",
  },
});
