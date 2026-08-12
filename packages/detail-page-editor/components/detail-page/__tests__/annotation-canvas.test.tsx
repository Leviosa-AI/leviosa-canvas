import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  AnnotationCanvas,
  annotationBox,
  erasePen,
  hitAnnotation,
  type PenAnnotation,
} from "../annotation-canvas";

/**
 * 주석 캔버스의 순수 규칙.
 *
 * 지우개는 **닿은 데만** 지운다. 긴 획 하나를 그은 뒤 끝만 다듬으려던 유저가 획을
 * 통째로 잃으면 처음부터 다시 그린다 — 그림이 지시의 절반인 기능에서 그건 곧 지시를
 * 다시 쓰라는 말이다.
 */

const stroke = (points: [number, number][]): PenAnnotation => ({
  id: "p1",
  type: "pen",
  points,
  color: "#ff2d2d",
});

describe("erasePen", () => {
  it("splits a stroke into two when erased in the middle", () => {
    const line = stroke([
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0],
      [40, 0],
    ]);
    const pieces = erasePen(line, { x: 20, y: 0 }, 5);
    expect(pieces).toHaveLength(2);
    expect(pieces[0].points).toEqual([
      [0, 0],
      [10, 0],
    ]);
    expect(pieces[1].points).toEqual([
      [30, 0],
      [40, 0],
    ]);
  });

  it("keeps the original id on the first surviving run", () => {
    const pieces = erasePen(
      stroke([
        [0, 0],
        [10, 0],
        [20, 0],
        [30, 0],
        [40, 0],
      ]),
      { x: 20, y: 0 },
      5,
    );
    expect(pieces[0].id).toBe("p1");
    expect(pieces[1].id).not.toBe("p1");
  });

  it("trims only the touched end", () => {
    const pieces = erasePen(
      stroke([
        [0, 0],
        [10, 0],
        [20, 0],
      ]),
      { x: 20, y: 0 },
      5,
    );
    expect(pieces).toHaveLength(1);
    expect(pieces[0].points).toEqual([
      [0, 0],
      [10, 0],
    ]);
  });

  it("drops a run that no longer draws a line", () => {
    // 점 하나만 남은 구간은 그림이 아니다 — 남겨 두면 보이지 않는 잔여물이 쌓인다.
    const pieces = erasePen(
      stroke([
        [0, 0],
        [10, 0],
        [20, 0],
      ]),
      { x: 15, y: 0 },
      12,
    );
    expect(pieces).toHaveLength(0);
  });
});

describe("hitAnnotation", () => {
  it("hits a pen stroke near its segment, not near its bounding box corner", () => {
    const diagonal = stroke([
      [0, 0],
      [100, 100],
    ]);
    expect(hitAnnotation(diagonal, { x: 50, y: 52 }, 5)).toBe(true);
    expect(hitAnnotation(diagonal, { x: 0, y: 100 }, 5)).toBe(false);
  });

  it("hits inside a rect", () => {
    const rect = {
      id: "r",
      type: "rect" as const,
      x: 10,
      y: 10,
      w: 40,
      h: 20,
      color: "#111",
    };
    expect(hitAnnotation(rect, { x: 20, y: 20 }, 2)).toBe(true);
    expect(hitAnnotation(rect, { x: 200, y: 20 }, 2)).toBe(false);
  });
});

describe("annotationBox", () => {
  it("normalizes an arrow drawn right-to-left", () => {
    const box = annotationBox({
      id: "a",
      type: "arrow",
      x1: 100,
      y1: 80,
      x2: 20,
      y2: 10,
      color: "#111",
    });
    expect(box).toEqual({ x: 20, y: 10, w: 80, h: 70 });
  });
});

describe("AnnotationCanvas", () => {
  it("exposes every tool with an accessible name", () => {
    render(
      <AnnotationCanvas
        imageUrl="data:image/png;base64,AAA"
        labels={{ pen: "그리기", eraser: "지우개", undo: "실행 취소" }}
      />,
    );
    expect(screen.getByLabelText("그리기")).toBeTruthy();
    expect(screen.getByLabelText("지우개")).toBeTruthy();
    expect(screen.getByLabelText("실행 취소")).toBeTruthy();
  });

  it("starts on the pen so the first drag draws instead of selecting", () => {
    render(<AnnotationCanvas imageUrl="data:image/png;base64,AAA" labels={{ pen: "그리기" }} />);
    expect(screen.getByLabelText("그리기").getAttribute("aria-pressed")).toBe("true");
  });

  it("disables undo until something is drawn", () => {
    render(
      <AnnotationCanvas imageUrl="data:image/png;base64,AAA" labels={{ undo: "실행 취소" }} />,
    );
    expect(
      (screen.getByLabelText("실행 취소") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
