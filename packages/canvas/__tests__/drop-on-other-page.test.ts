import { describe, expect, it } from "vitest";

import { CanvasStore } from "../store";
import { elementRect, moveElementTo } from "../edit/rect";
import { applyInTransaction } from "../render/interaction";

/**
 * 벌을 넘어 요소를 옮기는 자리의 셈. DOM 을 타는 부분(어느 판 위인가)은 브라우저의
 * 몫이라, 여기서는 **앉히는 셈**만 잡는다 — 그룹처럼 «보이는 네모»와 `x/y` 속성이
 * 다른 요소가 어긋나 앉던 자리다.
 */
describe("다른 판에 앉히기", () => {
  const store = () =>
    new CanvasStore({
      pages: [
        {
          id: "a",
          width: 1080,
          height: 1350,
          children: [
            {
              id: "g",
              type: "group",
              x: 440,
              y: 172,
              children: [
                { id: "g1", type: "text", x: 30, y: 10, width: 115, height: 54, text: "50mL" },
              ],
            },
          ],
        },
        { id: "b", width: 1080, height: 1350, children: [] },
      ],
    });

  it("그룹은 보이는 네모가 놓은 자리에 온다", () => {
    // 그룹의 `x` 는 440 인데 보이는 네모는 470(=440+30)에서 시작한다. 속성에 바로
    // 써 넣으면 그 30 만큼 밀려 앉는다.
    const s = store();
    const source = s.getElementById("g")!;
    expect(elementRect(source).x).toBe(470);

    const target = s.pages[1];
    const made = target.addElement(source.toJSON());
    moveElementTo(made, 200, 300);

    expect(elementRect(made)).toMatchObject({ x: 200, y: 300 });
  });

  it("옮긴 것은 ⌘Z 한 번에 제자리로 돌아온다", () => {
    const s = store();
    const source = s.getElementById("g")!;
    const target = s.pages[1];

    applyInTransaction(s, () => {
      const made = target.addElement({ ...source.toJSON(), id: "g-copy" });
      moveElementTo(made, 200, 300);
      s.deleteElements(["g"]);
    });
    expect(s.getElementById("g")).toBeNull();
    expect(s.pages[1].children).toHaveLength(1);

    s.history.undo();
    expect(s.getElementById("g-copy")).toBeNull();
    expect(s.getElementById("g")).not.toBeNull();
    expect(elementRect(s.getElementById("g")!).x).toBe(470);
  });
});
