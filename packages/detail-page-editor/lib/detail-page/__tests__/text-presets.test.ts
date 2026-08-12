import { describe, expect, it, vi } from "vitest";

import type { StoreLike } from "../spec-group/sync";
import {
  REFERENCE_WIDTH,
  TEXT_PRESETS,
  insertTextPreset,
} from "../text-presets";

type Added = Record<string, unknown>;

function makeStore(pageWidth = 750, pageHeight = 1000) {
  const added: Added[] = [];
  const order: string[] = [];
  const groupElements = vi.fn(
    (ids: string[], attrs?: Record<string, unknown>) => ({
      id: "group-1",
      ids,
      ...attrs,
    }),
  );
  const store = {
    pages: [
      {
        computedWidth: pageWidth,
        computedHeight: pageHeight,
        addElement: (props: Added) => {
          const id = `el-${added.length + 1}`;
          added.push(props);
          order.push(id);
          return { id };
        },
      },
    ],
    history: { startTransaction: vi.fn(), endTransaction: vi.fn() },
    groupElements,
  } as unknown as StoreLike;
  return { store, added, groupElements };
}

const text = (key: string) => `[${key}]`;

describe("insertTextPreset", () => {
  it("프리셋의 모든 줄을 그룹 하나로 묶는다", () => {
    const preset = TEXT_PRESETS[0];
    const { store, added, groupElements } = makeStore();

    const group = insertTextPreset(store, preset, { text, name: "제목 + 설명" });

    expect(added).toHaveLength(preset.nodes.length);
    expect(groupElements).toHaveBeenCalledWith(
      added.map((_, index) => `el-${index + 1}`),
      { name: "제목 + 설명" },
    );
    expect(group).toMatchObject({ id: "group-1" });
  });

  it("자식은 페이지 절대 좌표로 앉는다 — 그룹에 base 오프셋을 남기면 두 번 밀린다", () => {
    const preset = TEXT_PRESETS[0];
    const { store, added } = makeStore(750, 1000);

    insertTextPreset(store, preset, { text });

    const width = 750 * 0.8;
    const scale = width / REFERENCE_WIDTH;
    const originX = Math.round((750 - width) / 2);
    const originY = Math.round((1000 - Math.round(preset.height * scale)) / 2);
    expect(added[0]).toMatchObject({ x: originX, y: originY });
    expect(added[1]).toMatchObject({
      x: originX,
      y: originY + Math.round(preset.nodes[1].y * scale),
    });
  });

  it("페이지 폭이 넓어지면 글자와 간격이 같은 비율로 커진다", () => {
    const preset = TEXT_PRESETS[0];
    const narrow = makeStore(750);
    const wide = makeStore(1500);

    insertTextPreset(narrow.store, preset, { text });
    insertTextPreset(wide.store, preset, { text });

    expect(wide.added[0].fontSize).toBe(
      (narrow.added[0].fontSize as number) * 2,
    );
  });

  it("모든 줄에 상자 높이를 준다 — 안 주면 넣자마자 글자가 잘린다", () => {
    for (const preset of TEXT_PRESETS) {
      const { store, added } = makeStore();
      insertTextPreset(store, preset, { text });
      for (const el of added) {
        expect(el.height).toBeGreaterThan(0);
        expect(el.width).toBeGreaterThan(0);
      }
    }
  });

  it("문서 서체를 물려받고, 안 주면 기본 서체로 들어간다", () => {
    const preset = TEXT_PRESETS[0];
    const inherited = makeStore();
    const fallback = makeStore();

    insertTextPreset(inherited.store, preset, { text, fontFamily: "WantedSans" });
    insertTextPreset(fallback.store, preset, { text });

    expect(inherited.added[0].fontFamily).toBe("WantedSans");
    expect(fallback.added[0].fontFamily).toBe("Pretendard");
  });

  it("한 번의 되돌리기로 통째로 사라진다", () => {
    const { store } = makeStore();
    const history = store.history as unknown as {
      startTransaction: () => void;
      endTransaction: () => void;
    };

    insertTextPreset(store, TEXT_PRESETS[0], { text });

    expect(history.startTransaction).toHaveBeenCalledOnce();
    expect(history.endTransaction).toHaveBeenCalledOnce();
  });

  it("그룹을 못 만드는 스토어면 아무것도 안 넣는다", () => {
    const { store } = makeStore();
    delete (store as { groupElements?: unknown }).groupElements;

    expect(insertTextPreset(store, TEXT_PRESETS[0], { text })).toBeNull();
  });
});

describe("TEXT_PRESETS 카탈로그", () => {
  it("키가 겹치지 않는다", () => {
    const keys = TEXT_PRESETS.map((preset) => preset.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("줄이 프리셋 높이 안에 들어온다 — 미리보기 비율이 여기서 나온다", () => {
    for (const preset of TEXT_PRESETS) {
      for (const node of preset.nodes) {
        const bottom = node.y + (node.height ?? node.fontSize * 1.35);
        expect(bottom).toBeLessThanOrEqual(preset.height);
      }
    }
  });
});
