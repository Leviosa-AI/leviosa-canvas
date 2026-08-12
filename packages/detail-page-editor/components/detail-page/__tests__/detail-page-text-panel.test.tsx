import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DetailPageTextPanel } from "../detail-page-text-panel";
import { TEXT_PRESETS } from "../../../lib/detail-page/text-presets";

type Added = Record<string, unknown>;

function makeStore() {
  const added: Added[] = [];
  const groupElements = vi.fn((ids: string[]) => ({ id: "group-1", ids }));
  const store = {
    pages: [
      {
        computedWidth: 750,
        computedHeight: 1000,
        addElement: (props: Added) => {
          added.push(props);
          return { id: `el-${added.length}` };
        },
      },
    ],
    history: { startTransaction: vi.fn(), endTransaction: vi.fn() },
    groupElements,
  };
  return { store, added, groupElements };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("DetailPageTextPanel", () => {
  it("크기별 글상자를 하나씩 놓는다", async () => {
    const { store, added, groupElements } = makeStore();
    render(<DetailPageTextPanel store={store} />);

    await userEvent.click(
      screen.getByRole("button", { name: "detailPage.text.heading" }),
    );

    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ type: "text", fontSize: 48 });
    // 한 줄짜리는 묶을 게 없다.
    expect(groupElements).not.toHaveBeenCalled();
  });

  it("묶음 프리셋은 여러 줄을 한 그룹으로 놓는다", async () => {
    const preset = TEXT_PRESETS[0];
    const { store, added, groupElements } = makeStore();
    render(<DetailPageTextPanel store={store} />);

    await userEvent.click(
      screen.getByRole("button", {
        name: new RegExp(`detailPage.textPresets.${preset.key}.`),
      }),
    );

    expect(added).toHaveLength(preset.nodes.length);
    expect(groupElements).toHaveBeenCalledOnce();
  });

  it("미리보기는 카탈로그를 그대로 축소해 그린다 — 목록과 결과가 어긋나지 않게", () => {
    const { store } = makeStore();
    render(<DetailPageTextPanel store={store} />);

    for (const preset of TEXT_PRESETS) {
      for (const node of preset.nodes) {
        expect(
          screen.getAllByText(`detailPage.textPresets.${preset.key}.${node.key}`)
            .length,
        ).toBeGreaterThan(0);
      }
    }
  });
});
