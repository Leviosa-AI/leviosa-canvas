// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PromptEditPanel } from "../prompt-edit-panel";
import { GroupPromptEditPanel } from "../group-prompt-edit-panel";
import { withDetailPageHost } from "./host-stub";

/** 프롬프트 편집 실패는 서버 원문 대신 번역 문구로 알리고, 원문은 콘솔로 보낸다. */
describe("프롬프트 편집 실패 문구", () => {
  const raw = new Error("upstream 502 Bad Gateway");

  it("카피 편집", async () => {
    const toastError = vi.fn();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      withDetailPageHost(
        <PromptEditPanel generatedId="g" slotRole="headline" currentText="a" onApplied={vi.fn()} />,
        {
          api: {
            promptEditDetailPageCopy: vi.fn().mockRejectedValue(raw),
            asEditQuotaError: () => null,
          },
          toast: { error: toastError },
        },
      ),
    );
    await userEvent.type(screen.getByRole("textbox"), "짧게");
    await userEvent.click(screen.getByRole("button", { name: "detailPage.promptEdit.send" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("detailPage.promptEdit.requestFailed"),
    );
    expect(errSpy).toHaveBeenCalledWith(expect.any(String), raw);
    errSpy.mockRestore();
  });

  it("그룹 편집", async () => {
    const toastError = vi.fn();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      withDetailPageHost(
        <GroupPromptEditPanel
          generatedId="g"
          items={[{ id: "t1", kind: "text", current_text: "a" } as never]}
          onApplied={vi.fn()}
        />,
        {
          api: {
            groupPromptEditDetailPage: vi.fn().mockRejectedValue(raw),
            asEditQuotaError: () => null,
          },
          toast: { error: toastError },
        },
      ),
    );
    await userEvent.type(
      screen.getByPlaceholderText("detailPage.promptEdit.groupPlaceholder"),
      "통일",
    );
    await userEvent.click(screen.getByRole("button", { name: "detailPage.promptEdit.send" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("detailPage.promptEdit.requestFailed"),
    );
    expect(errSpy).toHaveBeenCalledWith(expect.any(String), raw);
    errSpy.mockRestore();
  });
});
