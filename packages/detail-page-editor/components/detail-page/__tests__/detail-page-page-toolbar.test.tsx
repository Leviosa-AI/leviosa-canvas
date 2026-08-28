import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DetailPagePageToolbar } from "../detail-page-page-toolbar";
import { onSectionReauthorRequested } from "../../../lib/detail-page/section-reauthor-bus";

/**
 * 캔버스 옆에 남은 것은 «이 화면 다시 만들기» 하나뿐이다. 나머지(위·아래·복제·추가·
 * 삭제)는 화면을 가리는 데 비해 쓰임이 적어 페이지 목록과 오른쪽 패널로 옮겼다.
 */
describe("DetailPagePageToolbar", () => {
  afterEach(() => vi.restoreAllMocks());

  it("다시 만들기를 안 꽂았으면 아무것도 안 그린다", () => {
    const { container } = render(
      <DetailPagePageToolbar store={{}} page={{ id: "b" }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("누르면 그 화면 id 로 재저작을 요청한다", async () => {
    const user = userEvent.setup();
    const heard: string[] = [];
    const off = onSectionReauthorRequested((id) => heard.push(id));
    try {
      render(<DetailPagePageToolbar store={{}} page={{ id: "b" }} />);
      await user.click(
        screen.getByRole("button", { name: /detailPage.pageToolbar.reauthor/ }),
      );
      expect(heard).toEqual(["b"]);
    } finally {
      off();
    }
  });

  it("버튼은 그것 하나뿐이다", () => {
    const off = onSectionReauthorRequested(() => undefined);
    try {
      render(<DetailPagePageToolbar store={{}} page={{ id: "b" }} />);
      expect(screen.getAllByRole("button")).toHaveLength(1);
    } finally {
      off();
    }
  });
});
