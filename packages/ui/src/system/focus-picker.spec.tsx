import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FocusPoint } from "./focus-picker";

import { FocusPicker } from "./focus-picker";
import { renderWithSystem } from "./testing";

describe("a focus picker", () => {
  it("marks the subject from the picture's own corner", () => {
    renderWithSystem(
      <FocusPicker
        src="/files/hall"
        label="Subject"
        focus={{ x: 30, y: 70 }}
        onChange={() => undefined}
      />,
    );
    const mark = screen.getByRole("button", { name: "Subject" });
    expect(mark.style.left).toBe("30%");
    expect(mark.style.top).toBe("70%");
    expect(mark.closest("[dir]")?.getAttribute("dir")).toBe("ltr");
  });

  it("moves by the arrow keys, finer with shift, and never off the picture", () => {
    const onChange = vi.fn<(focus: FocusPoint) => void>();
    renderWithSystem(
      <FocusPicker
        src="/files/hall"
        label="Subject"
        focus={{ x: 98, y: 50 }}
        onChange={onChange}
      />,
    );
    const mark = screen.getByRole("button", { name: "Subject" });
    fireEvent.keyDown(mark, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith({ x: 100, y: 50 });
    fireEvent.keyDown(mark, { key: "ArrowUp", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith({ x: 98, y: 49 });
    fireEvent.keyDown(mark, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
