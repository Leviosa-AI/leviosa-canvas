import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SpecPromptEditPanel } from "../spec-prompt-edit-panel";
import { renderWithDetailPageHost } from "./host-stub";

const groupPromptEdit = vi.hoisted(() => vi.fn());
const toastInfo = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

const SPEC = { v: 1, kind: "bar-v", data: { labels: ["1주"], series: [] } };

function setup(props: Partial<React.ComponentProps<typeof SpecPromptEditPanel>> = {}) {
  const onApplied = vi.fn();
  const onUsage = vi.fn();
  renderWithDetailPageHost(
    <SpecPromptEditPanel
      generatedId="gid"
      specKind="chart"
      elementId="el-1"
      currentSpec={SPEC}
      onApplied={onApplied}
      {...props}
      onUsage={onUsage}
    />,
    {
      api: { groupPromptEditDetailPage: groupPromptEdit, asEditQuotaError: () => null },
      toast: { info: toastInfo, success: toastSuccess },
    },
  );
  return { onApplied, onUsage };
}

async function ask(text = "8주 추가해줘") {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox"), text);
  await user.click(screen.getByRole("button"));
}

describe("SpecPromptEditPanel", () => {
  beforeEach(() => {
    groupPromptEdit.mockReset();
    toastInfo.mockReset();
    toastSuccess.mockReset();
  });

  it("스펙을 kind=data로 보낸다", async () => {
    // 자식 글자(text)로 보내면 다음 재생성에 덮인다 — 반드시 data여야 한다.
    groupPromptEdit.mockResolvedValue({ results: [], text_used: 1, text_limit: 30 });
    setup();
    await ask();

    await waitFor(() => expect(groupPromptEdit).toHaveBeenCalled());
    const [id, payload] = groupPromptEdit.mock.calls[0];
    expect(id).toBe("gid");
    expect(payload.items).toEqual([
      { id: "el-1", kind: "data", spec_kind: "chart", current_spec: SPEC },
    ]);
  });

  it("돌아온 스펙을 적용한다", async () => {
    const next = { ...SPEC, options: { unit: "%" } };
    groupPromptEdit.mockResolvedValue({
      results: [{ id: "el-1", kind: "data", spec: next }],
      text_used: 2,
      text_limit: 30,
    });
    const { onApplied, onUsage } = setup();
    await ask();

    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(next));
    expect(onUsage).toHaveBeenCalledWith(2, 30);
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("변경이 없으면(spec 미포함) 적용하지 않는다", async () => {
    // 서버 계약: 바뀐 게 없으면 spec을 안 싣는다 = 원본 유지 = 무과금.
    groupPromptEdit.mockResolvedValue({
      results: [{ id: "el-1", kind: "data" }],
      text_used: 1,
      text_limit: 30,
    });
    const { onApplied } = setup();
    await ask("색을 파랗게");

    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("다른 요소의 결과를 집어오지 않는다", async () => {
    groupPromptEdit.mockResolvedValue({
      results: [{ id: "other", kind: "data", spec: { v: 1 } }],
      text_used: 1,
      text_limit: 30,
    });
    const { onApplied } = setup();
    await ask();

    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("한도를 다 쓰면 입력을 막는다", () => {
    setup({ editsUsed: 30, editLimit: 30 });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("표는 표 예시 문구를 띄운다", () => {
    setup({ specKind: "table" });
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      "detailPage.specPromptEdit.placeholder.table",
    );
  });
});
