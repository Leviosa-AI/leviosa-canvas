/**
 * 그룹 좌표 계약 — 우리 엔진이 만든 문서를 **내보내는 쪽**에서 잰다.
 *
 * 스토어 테스트만으로는 이 계약이 안 지켜진다. 그룹에 `x=left, y=top`을 주고 자식을
 * 그만큼 빼도 우리 엔진 안에서는 멀쩡히 그려지기 때문이다 — `absolutePosition`이
 * 조상 x/y를 더해 주니까. 틀렸다는 사실은 문서를 밖으로 낼 때만 드러난다.
 *
 * SVG 내보내기는 그룹을 `<g>`로 감싸되 **transform을 안 준다**(`export/svg.ts`).
 * 자식 좌표를 그대로 쓴다는 뜻이고, 그래서 이 테스트가 계약의 실제 심판이다.
 */

import { describe, expect, it } from "vitest";

import type { ExportDocument } from "@/lib/detail-page-polotno/export/document-model";
import { buildSvgDocument } from "@/lib/detail-page-polotno/export/svg";
import { createCanvasStore } from "@/lib/leviosa-canvas/store";
import type { DocumentJson } from "@/lib/leviosa-canvas/types";

/** 글자 폭은 글자당 10px로 고정 — 좌표만 보는 테스트라 폰트는 상관없다. */
const measure = (_el: unknown, text: string) => text.length * 10;

/** 실제 픽스처와 같은 모양: 그룹은 x=0,y=0이고 자식이 페이지 좌표를 든다. */
function doc(): DocumentJson {
  return {
    width: 750,
    height: 500,
    pages: [
      {
        id: "p1",
        children: [
          {
            id: "badge",
            type: "figure",
            subType: "rect",
            x: 169,
            y: 178,
            width: 412,
            height: 51,
            fill: "#f3f3f3",
          },
          {
            id: "label",
            type: "text",
            x: 199,
            y: 190,
            width: 300,
            height: 28,
            text: "수분 장벽",
            fontSize: 20,
            fontFamily: "Pretendard",
            fill: "#111111",
          },
        ],
      },
    ],
  };
}

function xsIn(svg: string): number[] {
  return [...svg.matchAll(/\sx="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
}

describe("그룹 좌표 계약", () => {
  it("묶기 전과 묶은 뒤의 SVG가 같은 자리에 그린다", () => {
    const before = buildSvgDocument(
      createCanvasStore(doc()).toJSON() as ExportDocument,
      { measure },
    );

    const store = createCanvasStore(doc());
    store.groupElements(["badge", "label"]);
    const after = buildSvgDocument(store.toJSON() as ExportDocument, { measure });

    // 그룹으로 묶었다는 이유만으로 그림이 움직이면 안 된다.
    expect(xsIn(after)).toEqual(xsIn(before));
    expect(after).toContain('x="169"');
    expect(after).toContain('x="199"');
  });

  it("그룹을 옮기면 자식이 아니라 그룹 x/y가 움직인다", () => {
    const store = createCanvasStore(doc());
    const group = store.groupElements(["badge", "label"])!;
    group.set({ x: 25, y: 0 });

    const json = store.toJSON();
    const groupJson = json.pages![0].children![0] as Record<string, unknown>;
    expect(groupJson.x).toBe(25);
    // 자식 좌표는 그대로다 — 옮긴 값은 그룹 하나가 든다.
    const kids = groupJson.children as Record<string, unknown>[];
    expect(kids.map((k) => k.x)).toEqual([169, 199]);
  });

  it("풀면 원본 JSON과 같아진다", () => {
    const store = createCanvasStore(doc());
    const group = store.groupElements(["badge", "label"])!;
    store.ungroupElements([group.id]);
    expect(store.toJSON().pages).toEqual(doc().pages);
  });
});
