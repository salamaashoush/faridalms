import type { ComponentProps } from "react";

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SetupGuideStep } from "./setup-guide";

import { SetupGuide } from "./setup-guide";
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

const step = (
  id: string,
  done: boolean,
  more: Partial<SetupGuideStep> = {},
): SetupGuideStep => ({
  id,
  title: `Set up ${id}`,
  description: `Why ${id} comes here.`,
  done,
  link: <Anchor />,
  ...more,
});

describe("SetupGuide", () => {
  it("ticks what is done, marks the next step and links each by its name", () => {
    renderWithSystem(
      <SetupGuide
        title="Getting started"
        steps={[
          step("details", true),
          step("year", false),
          step("classes", false),
          step("website", false, { optional: true }),
        ]}
      />,
    );
    const guide = screen.getByRole("region", { name: "Getting started" });
    expect(within(guide).getByText("1 of 4 steps done")).toBeInTheDocument();
    expect(within(guide).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    const items = within(guide).getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).not.toHaveAttribute("aria-current");
    expect(
      within(guide).getByRole("link", { name: "Review: Set up details" }),
    ).toBeInTheDocument();
    expect(
      within(guide).getByRole("link", { name: "Start: Set up year" }),
    ).toBeInTheDocument();
    expect(
      within(guide).getByRole("link", { name: "Open: Set up classes" }),
    ).toBeInTheDocument();
    expect(items[3]).toHaveTextContent("Optional");
    expect(
      within(guide).queryByRole("button", { name: "Hide" }),
    ).not.toBeInTheDocument();
  });

  it("says who takes a step the viewer cannot", () => {
    renderWithSystem(
      <SetupGuide
        title="Getting started"
        steps={[
          step("year", false, {
            link: undefined,
            note: "An administrator sets this up.",
          }),
        ]}
      />,
    );
    expect(
      screen.getByText("An administrator sets this up."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("offers to hide itself only once everything but the optional steps is done", async () => {
    const onHide = vi.fn();
    renderWithSystem(
      <SetupGuide
        title="Getting started"
        finished="Your school is set up."
        onHide={onHide}
        steps={[
          step("year", true),
          step("website", false, { optional: true }),
        ]}
      />,
    );
    expect(screen.getByText("Your school is set up.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(onHide).toHaveBeenCalledOnce();
  });
});
