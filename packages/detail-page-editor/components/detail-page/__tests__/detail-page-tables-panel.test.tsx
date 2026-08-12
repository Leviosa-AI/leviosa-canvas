import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DetailPageTablesPanel } from "../detail-page-tables-panel";
import { TABLE_PRESETS } from "../../../lib/detail-page/table/defaults";
import { readTableSpec } from "../../../lib/detail-page/table/sync";

/**
 * 패널은 실제 ``insertTable``을 그대로 태운다(모킹하지 않는다). 프리셋 클릭 한 번이
 * 스토어에 어떤 모양으로 떨어지는지가 이 패널의 유일한 계약이라서.
 */
function makeStore() {
  let seq = 0;
  const attach = (node: Record<string, unknown>) => {
    node.set = (props: Record<string, unknown>) => Object.assign(node, props);
    return node;
  };
  const page = {
    computedWidth: 1000,
    computedHeight: 1400,
    children: [] as Record<string, unknown>[],
    addElement: (props: Record<string, unknown>) => {
      const el = attach({ id: `e${++seq}`, ...props });
      page.children.push(el);
      return el;
    },
  };
  return {
    activePage: page,
    pages: [page],
    groupElements: (ids: string[], attrs: Record<string, unknown> = {}) => {
      const picked = page.children.filter((el) => ids.includes(String(el.id)));
      page.children = page.children.filter((el) => !ids.includes(String(el.id)));
      const group = attach({ id: `g${++seq}`, type: "group", children: picked, ...attrs });
      page.children.push(group);
      return group;
    },
    deleteElements: () => undefined,
  };
}

describe("DetailPageTablesPanel", () => {
  it("프리셋마다 썸네일을 굽는다", () => {
    render(<DetailPageTablesPanel store={makeStore()} />);
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(TABLE_PRESETS.length);
    for (const image of images) {
      // 썸네일은 렌더러 출력을 옮긴 SVG data URI다(별도 자산이 아니다).
      expect(image.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    }
  });

  it("프리셋을 누르면 표 그룹 하나가 놓인다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    render(<DetailPageTablesPanel store={store} />);

    await user.click(screen.getAllByRole("button")[0]);

    expect(store.activePage.children).toHaveLength(1);
    const group = store.activePage.children[0];
    expect(readTableSpec(group)).toMatchObject({ v: 1, kind: "keyvalue" });
  });

  it("페이지 폭의 80%로 넣는다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    render(<DetailPageTablesPanel store={store} />);

    await user.click(screen.getAllByRole("button")[0]);

    const spec = readTableSpec(store.activePage.children[0])!;
    // 렌더된 폭이 스펙 frame에 되먹혀 있다.
    expect(spec.frame.width).toBe(800);
  });

  it("문서에서 가장 많이 쓰인 폰트를 물려받는다", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.activePage.addElement({ type: "text", fontFamily: "Paperozi" });
    store.activePage.addElement({ type: "text", fontFamily: "Paperozi" });
    render(<DetailPageTablesPanel store={store} />);

    await user.click(screen.getAllByRole("button")[0]);

    const group = store.activePage.children.find((el) => el.type === "group")!;
    expect(readTableSpec(group)!.style.fontFamily).toBe("Paperozi");
  });
});
