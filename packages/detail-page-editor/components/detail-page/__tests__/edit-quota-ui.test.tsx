import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditQuotaBlock, EditUsageBadge } from "../edit-quota-ui";

describe("EditUsageBadge", () => {
  it("사용/한도를 'N/M회'로 보여준다", () => {
    render(<EditUsageBadge used={4} limit={15} />);
    expect(screen.getByText("detailPage.editQuota.usage")).toBeInTheDocument();
  });

  it("unlimited면 분모 없이 'N회'만 보여준다", () => {
    render(<EditUsageBadge used={7} limit={15} unlimited />);
    expect(
      screen.getByText("detailPage.editQuota.usedUnlimited"),
    ).toBeInTheDocument();
    // 무제한 경로는 분모(한도)가 든 usage 키가 아니라 usedUnlimited 키를 쓴다.
    expect(
      screen.queryByText("detailPage.editQuota.usage"),
    ).not.toBeInTheDocument();
  });
});

describe("EditQuotaBlock", () => {
  it("소진 문구와 종류별 라벨(도형/텍스트)을 보여준다", () => {
    render(<EditQuotaBlock kind="svg" onBuyMore={() => {}} />);
    expect(
      screen.getByText("detailPage.editQuota.quotaExhausted"),
    ).toBeInTheDocument();
  });

  it("onBuyMore가 있으면 CTA 클릭이 콜백을 부른다", async () => {
    const onBuyMore = vi.fn();
    render(<EditQuotaBlock kind="text" onBuyMore={onBuyMore} />);
    await userEvent.click(screen.getByRole("button", { name: "detailPage.editQuota.buyCredits" }));
    expect(onBuyMore).toHaveBeenCalledOnce();
  });

  it("onBuyMore가 없으면 CTA가 비활성", () => {
    render(<EditQuotaBlock kind="text" />);
    expect(screen.getByRole("button", { name: "detailPage.editQuota.buyCredits" })).toBeDisabled();
  });
});
