/**
 * 내보내기 동등성 — 우리 엔진을 거친 문서가 원본과 **같은 파일**을 낸다.
 *
 * `.ai`/`.psd`/`.svg` 세 경로는 스토어가 아니라 평범한 JSON을 먹는다
 * (`export/document-model.ts`). 그러니 새 엔진이 붙는 조건은 하나다 —
 * `store.toJSON()`이 원본 JSON과 같은 그림을 내는가.
 *
 * 손으로 만든 문서 하나로는 부족하다. **실제 브랜드 템플릿 전부**를 불러
 * 우리 스토어를 통과시킨 뒤 SVG를 굽고, 원본 JSON을 그대로 구운 것과 글자
 * 하나까지 견준다. 좌표 규약이 어긋나거나 필드를 하나라도 흘리면 여기서 깨진다.
 *
 * SVG로 재는 이유는 순수 함수라서다. `.psd`는 브라우저 캔버스를, `.ai`는 폰트
 * 바이트를 요구해서 jsdom에서 못 돌린다 — 셋 다 같은 `ExportDocument`를 먹으므로
 * 입력이 같으면 결과도 같다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ExportDocument } from "@/lib/detail-page-canvas/export/document-model";
import { buildSvgDocument } from "@/lib/detail-page-canvas/export/svg";
import { createCanvasStore } from "@/lib/leviosa-canvas/store";
import type { DocumentJson } from "@/lib/leviosa-canvas/types";

const FIXTURE_DIR = join(process.cwd(), "public", "dev-fixtures");
/** 글자 폭은 글자당 10px로 고정 — 좌표·구조만 보는 테스트라 폰트는 상관없다. */
const measure = (_el: unknown, text: string) => text.length * 10;

function fixtures(): Array<{ name: string; doc: DocumentJson }> {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".leviosa.json"))
    .sort()
    .map((name) => {
      const raw = JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8"));
      return { name, doc: (raw.canvas_json ?? raw) as DocumentJson };
    });
}

describe("내보내기 동등성 — 브랜드 템플릿 전부", () => {
  const all = fixtures();

  it("픽스처를 실제로 읽었다", () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it.each(all.map((f) => [f.name, f.doc] as const))(
    "%s — 스토어를 통과해도 같은 SVG가 나온다",
    (_name, doc) => {
      const expected = buildSvgDocument(doc as ExportDocument, { measure });
      const actual = buildSvgDocument(
        createCanvasStore(doc).toJSON() as ExportDocument,
        { measure },
      );
      expect(actual).toBe(expected);
    },
  );

  it.each(all.map((f) => [f.name, f.doc] as const))(
    "%s — JSON을 무손실로 되돌려 쓴다",
    (_name, doc) => {
      expect(createCanvasStore(doc).toJSON()).toEqual(doc);
    },
  );
});
