import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { DetailPageFontPicker } from "../detail-page-font-picker";

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("DetailPageFontPicker", () => {
  it("searches static previews and applies the selected family", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn().mockResolvedValue(undefined);
    render(
      <DetailPageFontPicker
        value="Roboto"
        text="Hello"
        documentFamilies={["Roboto"]}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "detailPage.properties.chooseFont" }));
    expect(screen.getByAltText("페이퍼로지")).toHaveAttribute(
      "src",
      expect.stringContaining("/detail-font-previews/paperlogy.webp"),
    );

    await user.type(
      screen.getByPlaceholderText("detailPage.properties.fontSearch"),
      "D2Coding",
    );
    await user.click(screen.getByRole("option", { name: /D2Coding/ }));

    expect(onSelect).toHaveBeenCalledWith("D2Coding");
  });

  it("offers the bundled families the picker used to hide", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn().mockResolvedValue(undefined);
    render(
      <DetailPageFontPicker
        value="Roboto"
        text="Hello"
        documentFamilies={["Roboto"]}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "detailPage.properties.chooseFont" }));
    // Bundled previews come from the cardnews folder, not the CDN catalog's.
    expect(screen.getByAltText("나눔명조")).toHaveAttribute(
      "src",
      expect.stringContaining("/cardnews-font-previews/nanum-myeongjo.webp"),
    );

    await user.type(
      screen.getByPlaceholderText("detailPage.properties.fontSearch"),
      "나눔명조",
    );
    await user.click(screen.getByRole("option", { name: /나눔명조/ }));

    expect(onSelect).toHaveBeenCalledWith("Nanum Myeongjo");
  });

  it("flags a Latin-only font", async () => {
    const user = userEvent.setup();
    render(
      <DetailPageFontPicker
        value="Roboto"
        text="Hello"
        documentFamilies={["Roboto"]}
        onSelect={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "detailPage.properties.chooseFont" }));
    expect(
      screen.getByRole("option", { name: /Jost/ }),
    ).toHaveTextContent("detailPage.properties.fontLatinOnly");
    expect(
      screen.getByRole("option", { name: /페이퍼로지/ }),
    ).not.toHaveTextContent("detailPage.properties.fontLatinOnly");
  });

  it("locks exactly eight Latin-only fonts when the text contains Korean", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn().mockResolvedValue(undefined);
    render(
      <DetailPageFontPicker
        value="Roboto"
        text="한글 ㅋㅋㅋ"
        documentFamilies={["Roboto"]}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "detailPage.properties.chooseFont" }));
    const locked = screen
      .getAllByRole("option")
      .filter((option) => option.getAttribute("data-disabled") === "true");
    expect(locked).toHaveLength(8);
    expect(screen.getByText("detailPage.properties.fontLatinOnlyUnavailable")).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /Jost/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps Latin-only fonts selectable for Latin text", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn().mockResolvedValue(undefined);
    render(
      <DetailPageFontPicker
        value="Roboto"
        text="Summer sale"
        documentFamilies={["Roboto"]}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "detailPage.properties.chooseFont" }));
    await user.click(screen.getByRole("option", { name: /Jost/ }));
    expect(onSelect).toHaveBeenCalledWith("Jost");
  });

  it("narrows the list to the chosen chips and back", async () => {
    const user = userEvent.setup();
    render(
      <DetailPageFontPicker
        value="Roboto"
        text="Hello"
        documentFamilies={["Roboto"]}
        onSelect={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "detailPage.properties.chooseFont" }));
    expect(screen.getByAltText("페이퍼로지")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "detailPage.fontTags.pixel" }));
    expect(screen.getByAltText("갈무리9")).toBeInTheDocument();
    expect(screen.queryByAltText("페이퍼로지")).not.toBeInTheDocument();
    // 문서에서 쓰던 글꼴은 태그가 없다 — 칩을 켠 사람이 찾는 것도 아니다.
    expect(screen.queryByRole("option", { name: "Roboto" })).not.toBeInTheDocument();

    // 두 번째 칩은 걸러진 목록을 더 좁힌다.
    await user.click(screen.getByRole("button", { name: "detailPage.fontTags.rounded" }));
    expect(screen.getByAltText("둥근모꼴")).toBeInTheDocument();
    expect(screen.queryByAltText("갈무리9")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "detailPage.properties.fontTagAll" }));
    expect(screen.getByAltText("페이퍼로지")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Roboto" })).toBeInTheDocument();
  });

  it("marks the chips that are on", async () => {
    const user = userEvent.setup();
    render(
      <DetailPageFontPicker
        value="Roboto"
        text="Hello"
        documentFamilies={[]}
        onSelect={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "detailPage.properties.chooseFont" }));
    const all = screen.getByRole("button", { name: "detailPage.properties.fontTagAll" });
    const handwriting = screen.getByRole("button", {
      name: "detailPage.fontTags.handwriting",
    });
    expect(all).toHaveAttribute("aria-pressed", "true");

    await user.click(handwriting);
    expect(handwriting).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");

    await user.click(handwriting);
    expect(handwriting).toHaveAttribute("aria-pressed", "false");
    expect(all).toHaveAttribute("aria-pressed", "true");
  });

  /**
   * 소비자 앱(leviosa-agency)의 `--color-accent` 는 먹이다. 목록 행이 그 이름을
   * 빌려 쓰면 호버한 순간 행이 새까매지고 미리보기도 이름표도 사라진다.
   * 강조색이 아니라 편집기 회색 토큰으로 칠하는지 클래스로 못박는다.
   */
  it("tints a hovered row with the editor's own gray, never the host accent", async () => {
    const user = userEvent.setup();
    render(
      <DetailPageFontPicker
        value="Roboto"
        text="Hello"
        documentFamilies={["Roboto"]}
        onSelect={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "detailPage.properties.chooseFont" }));
    for (const option of screen.getAllByRole("option")) {
      expect(option.className).toContain("data-[selected=true]:bg-le-ink-100");
      expect(option.className).not.toMatch(/bg-accent|accent-foreground/);
    }
  });

  it("keeps the picker open and reports a failed font load", async () => {
    const user = userEvent.setup();
    render(
      <DetailPageFontPicker
        value="Roboto"
        text="Hello"
        documentFamilies={["Roboto"]}
        onSelect={vi.fn().mockRejectedValue(new Error("offline"))}
      />,
    );

    await user.click(screen.getByRole("button", { name: "detailPage.properties.chooseFont" }));
    await user.type(
      screen.getByPlaceholderText("detailPage.properties.fontSearch"),
      "Paperlogy",
    );
    await user.click(screen.getByRole("option", { name: /페이퍼로지/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "detailPage.properties.fontLoadFailed",
    );
  });
});
