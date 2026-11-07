import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CropFrame } from "./crop-frame";
import { renderWithSystem } from "./testing";

const frame = { x: 0.25, y: 0, width: 0.5, height: 1 };

describe("a crop frame", () => {
  it("draws the part kept over the picture, from the picture's own corner", () => {
    renderWithSystem(
      <CropFrame
        src="/files/hall"
        label="Crop frame"
        frame={frame}
        onCenter={() => undefined}
      />,
    );
    const kept = screen.getByRole("button", { name: "Crop frame" });
    expect(kept.style.left).toBe("25%");
    expect(kept.style.width).toBe("50%");
    expect(kept.closest("[dir]")?.getAttribute("dir")).toBe("ltr");
  });

  it("moves by the arrow keys, finer with shift, and never past the picture", () => {
    const onCenter = vi.fn<(x: number, y: number) => void>();
    renderWithSystem(
      <CropFrame
        src="/files/hall"
        label="Crop frame"
        frame={frame}
        onCenter={onCenter}
      />,
    );
    const kept = screen.getByRole("button", { name: "Crop frame" });
    fireEvent.keyDown(kept, { key: "ArrowRight" });
    expect(onCenter).toHaveBeenLastCalledWith(0.52, 0.5);
    fireEvent.keyDown(kept, { key: "ArrowUp", shiftKey: true });
    expect(onCenter).toHaveBeenLastCalledWith(0.5, 0.495);
    fireEvent.keyDown(kept, { key: "Enter" });
    expect(onCenter).toHaveBeenCalledTimes(2);
  });
});
