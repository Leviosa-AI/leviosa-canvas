/**
 * 텍스트 프리셋 — 여러 줄이 한 덩어리로 들어가는 글 묶음.
 *
 * 스톡 `TextSection`도 크기 버튼 아래에 이런 묶음 격자를 달고 있었지만, 그건 벤더
 * 서버에서 받아 오는 영문 포스터 디자인이라 우리 상세페이지에서 쓸 자리가 없었다.
 * 여기 있는 건 우리 템플릿이 실제로 반복하는 짜임이다 — 제목+설명, 눈썹라벨+제목,
 * 번호 매긴 단계, 인용, 각주 달린 문장.
 *
 * 좌표는 폭 `REFERENCE_WIDTH` 기준으로 적어 두고, 넣을 때 페이지 폭에 맞춰 한 번에
 * 줄인다. 그래서 750짜리 섹션이든 860짜리든 같은 비율로 앉는다.
 *
 * 넣는 글자는 문서 기본 서체로만 들어간다. 서체·색은 넣은 뒤 우측 인스펙터에서 고른다.
 */

import type { ElementLike, StoreLike } from "./spec-group/sync";

/** 프리셋 좌표계의 폭. 실제 삽입 폭은 페이지 폭의 80%다. */
export const REFERENCE_WIDTH = 1000;
const PAGE_RATIO = 0.8;

export type TextPresetNode = {
  /** 문구 i18n 키의 꼬리(`detailPage.textPresets.<preset>.<key>`). */
  key: string;
  y: number;
  fontSize: number;
  fontWeight: number;
  align: "left" | "center";
  /** 안 주면 `fontSize * 1.35`. 여러 줄로 접힐 수 있는 칸만 따로 준다. */
  height?: number;
  lineHeight?: number;
  letterSpacing?: number;
  fill?: string;
  /** 좌우 여백(기준 폭 안에서). 안 주면 0. */
  x?: number;
  width?: number;
};

export type TextPreset = {
  key: string;
  /** 묶음 전체 높이(기준 폭 기준). 미리보기 비율에도 쓴다. */
  height: number;
  nodes: TextPresetNode[];
};

const INK = "#111111";
const MUTED = "#6b6b6b";

export const TEXT_PRESETS: TextPreset[] = [
  {
    key: "headingBody",
    height: 190,
    nodes: [
      { key: "heading", y: 0, fontSize: 62, fontWeight: 700, align: "center" },
      {
        key: "body",
        y: 100,
        fontSize: 26,
        fontWeight: 400,
        align: "center",
        height: 80,
        lineHeight: 1.6,
        fill: MUTED,
      },
    ],
  },
  {
    key: "eyebrowHeading",
    height: 160,
    nodes: [
      {
        key: "eyebrow",
        y: 0,
        fontSize: 22,
        fontWeight: 600,
        align: "center",
        letterSpacing: 4,
        fill: MUTED,
      },
      { key: "heading", y: 48, fontSize: 58, fontWeight: 700, align: "center" },
    ],
  },
  {
    key: "numberedStep",
    height: 210,
    nodes: [
      { key: "number", y: 0, fontSize: 40, fontWeight: 700, align: "left", fill: MUTED },
      { key: "heading", y: 56, fontSize: 40, fontWeight: 600, align: "left" },
      {
        key: "body",
        y: 118,
        fontSize: 24,
        fontWeight: 400,
        align: "left",
        height: 84,
        lineHeight: 1.6,
        fill: MUTED,
      },
    ],
  },
  {
    key: "quote",
    height: 220,
    nodes: [
      {
        key: "quote",
        y: 0,
        fontSize: 36,
        fontWeight: 500,
        align: "center",
        height: 130,
        lineHeight: 1.5,
      },
      {
        key: "source",
        y: 158,
        fontSize: 22,
        fontWeight: 400,
        align: "center",
        fill: MUTED,
      },
    ],
  },
  {
    key: "claimFootnote",
    height: 190,
    nodes: [
      {
        key: "claim",
        y: 0,
        fontSize: 46,
        fontWeight: 700,
        align: "center",
        height: 120,
        lineHeight: 1.4,
      },
      {
        key: "footnote",
        y: 146,
        fontSize: 18,
        fontWeight: 400,
        align: "center",
        fill: MUTED,
      },
    ],
  },
];

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** 하나의 undo 단계로 묶는다. history가 없으면(테스트 페이크) 그냥 실행한다. */
function inTransaction<T>(store: StoreLike, run: () => T): T {
  const history = store.history;
  history?.startTransaction?.();
  try {
    return run();
  } finally {
    history?.endTransaction?.();
  }
}

export type InsertTextPresetOptions = {
  /** 문구 해석기 — 패널이 자기 `t`를 넘긴다. */
  text: (nodeKey: string) => string;
  /** 문서에서 물려받을 서체. 안 주면 Pretendard. */
  fontFamily?: string;
  /** 레이어 트리에 뜰 이름. 안 주면 프리셋 키. */
  name?: string;
};

/**
 * 프리셋을 그룹 하나로 놓는다.
 *
 * 자식 좌표는 **페이지 절대 좌표**로 적는다 — 그룹에 base x/y를 남기면 자식이 두 번
 * 밀린다(예전에 카드 밖으로 글자가 튀어나온 원인이 이거였다).
 */
export function insertTextPreset(
  store: StoreLike,
  preset: TextPreset,
  { text, fontFamily = "Pretendard", name }: InsertTextPresetOptions,
): ElementLike | null {
  const page = store.activePage ?? store.pages[0];
  if (!page || !store.groupElements) return null;

  const pageWidth = num(page.computedWidth, 750);
  const pageHeight = num(page.computedHeight, 1000);
  const width = Math.round(pageWidth * PAGE_RATIO);
  const scale = width / REFERENCE_WIDTH;
  const height = Math.round(preset.height * scale);
  const originX = Math.round((pageWidth - width) / 2);
  const originY = Math.round((pageHeight - height) / 2);

  return inTransaction(store, () => {
    const ids: string[] = [];
    for (const node of preset.nodes) {
      const fontSize = Math.round(node.fontSize * scale);
      const added = page.addElement(
        {
          type: "text",
          text: text(node.key),
          fontFamily,
          fontSize,
          fontWeight: node.fontWeight,
          fill: node.fill ?? INK,
          align: node.align,
          ...(node.lineHeight ? { lineHeight: node.lineHeight } : {}),
          ...(node.letterSpacing
            ? { letterSpacing: node.letterSpacing * scale }
            : {}),
          x: originX + Math.round(num(node.x) * scale),
          y: originY + Math.round(node.y * scale),
          width: Math.round((node.width ?? REFERENCE_WIDTH) * scale),
          // 상자 높이를 안 주면 넣자마자 글자가 잘린다.
          height: Math.round((node.height ?? node.fontSize * 1.35) * scale),
        },
        // 부품마다 선택이 옮겨 다니면 그사이 우측 인스펙터가 깜빡인다. 최종 선택은
        // groupElements가 그룹으로 잡아 준다.
        { skipSelect: true },
      ) as ElementLike | undefined;
      const id = added?.id;
      if (typeof id === "string") ids.push(id);
    }
    if (ids.length === 0) return null;
    const group = store.groupElements?.(ids, {
      name: name ?? preset.key,
    }) as ElementLike | undefined;
    return group ?? null;
  });
}
