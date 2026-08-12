import { act, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FindReplacePanel } from "../find-replace-panel";

type El = {
  id: string;
  type?: string;
  text?: string;
  custom?: Record<string, unknown>;
  children?: El[];
  set?: (props: Record<string, unknown>) => void;
};

function makeStore() {
  const els: Record<string, El> = {};
  const attach = (el: El): El => {
    el.set = (props: Record<string, unknown>) => Object.assign(el, props);
    els[el.id] = el;
    for (const child of el.children ?? []) attach(child);
    return el;
  };
  const pages = [
    {
      id: "hero",
      children: [attach({ id: "t1", type: "text", text: "30ml 한 병" })],
    },
    {
      id: "spec",
      children: [
        attach({
          id: "cht",
          type: "group",
          custom: { chart: {} },
          children: [{ id: "axis", type: "text", text: "30ml 기준" }],
        }),
        attach({ id: "t2", type: "text", text: "총 30ml, 30ml 보장" }),
      ],
    },
  ];
  const selectPage = vi.fn();
  const selectElements = vi.fn();
  return {
    els,
    pages,
    selectPage,
    selectElements,
    getElementById: (id: string) => els[id],
    history: { startTransaction: vi.fn(), endTransaction: vi.fn() },
  };
}

async function openPanel(store: ReturnType<typeof makeStore>) {
  const view = render(<FindReplacePanel store={store} />);
  await act(async () => {
    fireEvent.keyDown(document, { key: "f", metaKey: true });
  });
  return view;
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement;

/** 카운터의 숫자. i18n 목이 키를 그대로 돌려주므로 문구가 아니라 값을 본다. */
function counts() {
  const el = q("[data-dp-find-count]");
  return {
    current: Number(el.dataset.dpFindCurrent),
    blocks: Number(el.dataset.dpFindBlocks),
    total: Number(el.dataset.dpFindTotal),
  };
}

describe("FindReplacePanel", () => {
  it("⌘F 전에는 안 보인다", () => {
    render(<FindReplacePanel store={makeStore()} />);
    expect(q("[data-dp-find-replace]")).toBeNull();
  });

  it("⌘F로 열린다", async () => {
    await openPanel(makeStore());
    expect(q("[data-dp-find-replace]")).not.toBeNull();
  });

  it("찾으면 블록 수와 전체 자리 수를 함께 센다", async () => {
    // 캔버스에선 글자 일부만 하이라이트할 수 없어 이동은 요소 단위지만, 실제로
    // 바뀔 자리 수는 따로 알려 줘야 한다.
    const store = makeStore();
    await openPanel(store);
    await userEvent.type(q("[data-dp-find-query]"), "30ml");
    // t1 1곳 + t2 2곳 = 블록 2개, 전체 3곳. 차트 안 "30ml"는 빠진다.
    expect(counts()).toEqual({ current: 1, blocks: 2, total: 3 });
  });

  it("없으면 없다고 말하고 버튼이 죽는다", async () => {
    const store = makeStore();
    await openPanel(store);
    await userEvent.type(q("[data-dp-find-query]"), "없는말");
    expect(counts()).toEqual({ current: 0, blocks: 0, total: 0 });
    expect((q("[data-dp-find-replace-all]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("다음으로 옮기면 그 섹션과 요소를 고른다", async () => {
    const store = makeStore();
    await openPanel(store);
    await userEvent.type(q("[data-dp-find-query]"), "30ml");
    await userEvent.click(q("[data-dp-find-next]"));
    expect(store.selectPage).toHaveBeenCalledWith("spec");
    expect(store.selectElements).toHaveBeenCalledWith(["t2"]);
  });

  it("모두 바꾸기는 차트를 뺀 전부를 한 트랜잭션으로 고친다", async () => {
    const store = makeStore();
    await openPanel(store);
    await userEvent.type(q("[data-dp-find-query]"), "30ml");
    await userEvent.type(q("[data-dp-find-replacement]"), "50ml");
    await userEvent.click(q("[data-dp-find-replace-all]"));
    expect(store.els.t1.text).toBe("50ml 한 병");
    expect(store.els.t2.text).toBe("총 50ml, 50ml 보장");
    // 차트 안 글자는 다음 동기화에 되돌아가므로 손대지 않는다.
    expect(store.els.axis.text).toBe("30ml 기준");
    // ⌘Z 한 번에 전부 되돌아가야 한다.
    expect(store.history.startTransaction).toHaveBeenCalledTimes(1);
    expect(store.history.endTransaction).toHaveBeenCalledTimes(1);
  });

  it("바꾸기 하나는 지금 블록만 고친다", async () => {
    const store = makeStore();
    await openPanel(store);
    await userEvent.type(q("[data-dp-find-query]"), "30ml");
    await userEvent.type(q("[data-dp-find-replacement]"), "50ml");
    await userEvent.click(q("[data-dp-find-replace-one]"));
    expect(store.els.t1.text).toBe("50ml 한 병");
    expect(store.els.t2.text).toBe("총 30ml, 30ml 보장");
  });

  it("대소문자 구분을 켜면 결과가 줄어든다", async () => {
    const store = makeStore();
    store.els.t1.text = "Vita";
    store.els.t2.text = "vita";
    await openPanel(store);
    await userEvent.type(q("[data-dp-find-query]"), "vita");
    expect(counts().blocks).toBe(2);
    await userEvent.click(q("[data-dp-find-case]"));
    expect(q("[data-dp-find-case]").getAttribute("aria-pressed")).toBe("true");
    expect(counts().blocks).toBe(1);
  });

  it("닫기 버튼으로 사라진다", async () => {
    await openPanel(makeStore());
    await userEvent.click(q("[data-dp-find-close]"));
    expect(q("[data-dp-find-replace]")).toBeNull();
  });
});
