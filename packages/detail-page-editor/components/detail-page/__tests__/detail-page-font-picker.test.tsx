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

  it("flags a Latin-only font so it is not picked for Korean copy", async () => {
    const user = userEvent.setup();
    render(
      <DetailPageFontPicker
        value="Roboto"
        documentFamilies={["Roboto"]}
        onSelect={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "detailPage.properties.chooseFont" }));
    expect(
      screen.getByRole("option", { name: /IM 펠 잉글리시 SC/ }),
    ).toHaveTextContent("detailPage.properties.fontLatinOnly");
    expect(
      screen.getByRole("option", { name: /페이퍼로지/ }),
    ).not.toHaveTextContent("detailPage.properties.fontLatinOnly");
  });

  it("narrows the list to the chosen chips and back", async () => {
    const user = userEvent.setup();
    render(
      <DetailPageFontPicker
        value="Roboto"
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

  it("keeps the picker open and reports a failed font load", async () => {
    const user = userEvent.setup();
    render(
      <DetailPageFontPicker
        value="Roboto"
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
