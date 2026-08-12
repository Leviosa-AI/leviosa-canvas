import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DetailPageHistoryButtons } from "../detail-page-history-buttons";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function makeStore(canUndo: boolean, canRedo: boolean) {
  return {
    history: {
      canUndo,
      canRedo,
      undo: vi.fn(),
      redo: vi.fn(),
    },
  };
}

describe("DetailPageHistoryButtons", () => {
  it("calls history.undo / history.redo on click when enabled", async () => {
    const user = userEvent.setup();
    const store = makeStore(true, true);
    render(<DetailPageHistoryButtons store={store} />);

    await user.click(screen.getByLabelText("editor.undo"));
    expect(store.history.undo).toHaveBeenCalledOnce();

    await user.click(screen.getByLabelText("editor.redo"));
    expect(store.history.redo).toHaveBeenCalledOnce();
  });

  it("disables undo when canUndo is false and redo when canRedo is false", () => {
    const store = makeStore(false, false);
    render(<DetailPageHistoryButtons store={store} />);

    expect(screen.getByLabelText("editor.undo")).toBeDisabled();
    expect(screen.getByLabelText("editor.redo")).toBeDisabled();
  });

  it("does not fire the action while disabled", async () => {
    const user = userEvent.setup();
    const store = makeStore(false, true);
    render(<DetailPageHistoryButtons store={store} />);

    await user.click(screen.getByLabelText("editor.undo"));
    expect(store.history.undo).not.toHaveBeenCalled();
    expect(screen.getByLabelText("editor.redo")).toBeEnabled();
  });
});
