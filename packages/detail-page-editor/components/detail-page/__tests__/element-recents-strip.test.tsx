import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInsert = vi.fn();

vi.mock("../../../lib/detail-page/insert-shape", () => ({
  insertShape: (...args: unknown[]) => mockInsert(...args),
}));

import { ElementRecentsStrip } from "../element-recents-strip";
import {
  rememberElement,
  resetElementRecentsCache,
  toggleElementPin,
  isElementPinned,
  type ElementRecent,
} from "../../../lib/detail-page/element-recents";

const STORE = { pages: [] };

function entry(key: string): ElementRecent {
  return {
    key,
    markup: `<svg viewBox="0 0 24 24"><path d="${key}"/></svg>`,
    viewBox: "0 0 24 24",
    label: key,
  };
}

beforeEach(() => {
  localStorage.clear();
  resetElementRecentsCache();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("ElementRecentsStrip", () => {
  it("아무것도 없으면 자리를 안 먹는다", () => {
    const { container } = render(<ElementRecentsStrip store={STORE} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("최근에 넣은 것을 최신 순으로 보여 준다", () => {
    rememberElement(entry("a"));
    rememberElement(entry("b"));
    render(<ElementRecentsStrip store={STORE} />);

    const cells = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-label")?.match(/^[ab]$/));
    expect(cells.map((cell) => cell.getAttribute("aria-label"))).toEqual(["b", "a"]);
  });

  it("누르면 저장된 마크업 그대로 다시 넣는다", async () => {
    const user = userEvent.setup();
    rememberElement(entry("a"));
    render(<ElementRecentsStrip store={STORE} />);

    await user.click(screen.getByRole("button", { name: "a" }));

    expect(mockInsert).toHaveBeenCalledWith(
      STORE,
      entry("a").markup,
      "0 0 24 24",
    );
  });

  it("즐겨찾기가 최근보다 앞에 선다", () => {
    rememberElement(entry("a"));
    rememberElement(entry("b"));
    toggleElementPin(entry("a"));
    render(<ElementRecentsStrip store={STORE} />);

    const cells = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-label")?.match(/^[ab]$/));
    expect(cells.map((cell) => cell.getAttribute("aria-label"))).toEqual(["a", "b"]);
  });

  it("별을 누르면 즐겨찾기에 꽂히고 다시 누르면 빠진다", async () => {
    const user = userEvent.setup();
    rememberElement(entry("a"));
    render(<ElementRecentsStrip store={STORE} />);

    await user.click(screen.getByRole("button", { name: "detailPage.recents.pin" }));
    expect(isElementPinned("a")).toBe(true);

    await user.click(screen.getByRole("button", { name: "detailPage.recents.unpin" }));
    expect(isElementPinned("a")).toBe(false);
  });

  it("같은 것이 즐겨찾기와 최근에 두 번 나오지 않는다", () => {
    rememberElement(entry("a"));
    toggleElementPin(entry("a"));
    render(<ElementRecentsStrip store={STORE} />);

    expect(screen.getAllByRole("button", { name: "a" })).toHaveLength(1);
  });

  it("바깥에서 목록이 바뀌면 다시 그린다", async () => {
    render(<ElementRecentsStrip store={STORE} />);
    expect(screen.queryByRole("button", { name: "a" })).not.toBeInTheDocument();

    rememberElement(entry("a"));

    expect(await screen.findByRole("button", { name: "a" })).toBeInTheDocument();
  });
});
