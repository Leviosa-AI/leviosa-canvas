import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LabApp } from "../src/LabApp";

describe("dpnext lab inspector layout fields", () => {
  it("shows missing layout values as auto blanks and does not write accidental zero dimensions", async () => {
    render(<LabApp />);

    fireEvent.click(screen.getByText("LEViosa · DAILY FORMULA"));
    const width = screen.getByLabelText("width") as HTMLInputElement;
    const height = screen.getByLabelText("height") as HTMLInputElement;
    expect(width.value).toBe("");
    expect(height.value).toBe("");
    expect(width.placeholder).toBe("auto");
    expect(height.placeholder).toBe("auto");

    await waitFor(() => expect(screen.getByRole("button", { name: "위치·크기 적용" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "위치·크기 적용" }));

    await waitFor(() => expect(screen.getByText("revision").nextSibling).toHaveTextContent("2"));
    expect((screen.getByLabelText("width") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("height") as HTMLInputElement).value).toBe("");
  });
});
