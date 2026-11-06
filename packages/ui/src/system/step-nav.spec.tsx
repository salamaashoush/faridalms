import type { ComponentProps } from "react";

import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StepNav } from "./step-nav";
import { renderWithSystem } from "./testing";

type AnchorProps = ComponentProps<"a">;

/** A plain link, standing in for the router link a screen passes. */
function Anchor({ children, ...props }: AnchorProps) {
  return (
    <a href="#step" {...props}>
      {children}
    </a>
  );
}

describe("StepNav", () => {
  it("marks the current step and numbers the rest", () => {
    renderWithSystem(
      <StepNav
        label="Steps"
        steps={[
          { id: "a", label: "Customer", state: "done", render: <Anchor /> },
          {
            id: "b",
            label: "Schools",
            state: "current",
            render: <Anchor />,
          },
          { id: "c", label: "Plan", state: "upcoming", render: <Anchor /> },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Steps" });
    expect(within(nav).getByRole("link", { name: /Schools/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(within(nav).getByRole("link", { name: /Plan/ })).toHaveTextContent(
      "3Plan",
    );
  });
});
