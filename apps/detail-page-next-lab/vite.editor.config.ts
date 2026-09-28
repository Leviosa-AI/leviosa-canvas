// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { defineConfig } from "vite";

/**
 * 편집기 셸을 통째로 띄워 보는 개발용 항구. `editor.html` 이 들어가는 문이다.
 *
 * 셸은 `next/image`·`next/link` 를 부르는데 여기는 Next 가 없다 — 그 둘만 평범한
 * `<img>`·`<a>` 로 바꿔 끼운다. 검사 도구가 쓰는 `vite.dpnext.config.ts` 는 건드리지 않는다.
 */
const here = new URL(".", import.meta.url).pathname;

export default defineConfig({
  root: here,
  base: "/detail-page-next-lab/",
  server: { host: "127.0.0.1", port: 4180, strictPort: true },
  resolve: {
    alias: {
      "next/image": `${here}src/shims/next-image.tsx`,
      "next/link": `${here}src/shims/next-link.tsx`,
    },
  },
});
