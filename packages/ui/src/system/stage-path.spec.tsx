import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StagePath } from "./stage-path";
import { renderWithSystem } from "./testing";

const STAGES = [
  { value: "new", label: "New" },
  { value: "demo", label: "Demo" },
  { value: "won", label: "Won" },
] as const;

describe("StagePath", () => {
  it("marks where the record stands among the stages", () => {
    renderWithSystem(
      <StagePath label="Pipeline" stages={STAGES} current="demo" />,
    );
    const path = screen.getByRole("list", { name: "Pipeline" });
    const [first, second, third] = within(path).getAllByRole("listitem");
    expect(first).not.toHaveAttribute("aria-current");
    expect(second).toHaveAttribute("aria-current", "step");
    expect(third).toHaveClass("bg-muted");
  });

  it("says where a record left the path early", () => {
    renderWithSystem(
      <StagePath
        label="Pipeline"
        stages={STAGES}
        current={null}
        left={{ label: "Lost: chose another product", at: "demo" }}
      />,
    );
    const path = screen.getByRole("list", { name: "Pipeline" });
    expect(within(path).getByText("Lost: chose another product")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });
});
