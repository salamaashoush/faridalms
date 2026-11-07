import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SidePanel } from "./side-panel";
import { renderWithSystem } from "./testing";

describe("SidePanel", () => {
  it("stands beside the page when docked, and closes from its own button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithSystem(
      <SidePanel
        open
        onOpenChange={onOpenChange}
        title="Comments"
        docked
      >
        <p>Two open threads</p>
      </SidePanel>,
    );
    const panel = screen.getByRole("complementary", { name: "Comments" });
    expect(panel).toHaveTextContent("Two open threads");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("draws nothing docked while closed", () => {
    renderWithSystem(
      <SidePanel open={false} onOpenChange={vi.fn()} title="Comments" docked>
        <p>Two open threads</p>
      </SidePanel>,
    );
    expect(screen.queryByText("Two open threads")).toBeNull();
  });

  it("opens as a sheet where the screen is narrow", async () => {
    renderWithSystem(
      <SidePanel open onOpenChange={vi.fn()} title="Comments" docked={false} phone>
        <p>Two open threads</p>
      </SidePanel>,
    );
    const sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveTextContent("Comments");
    expect(sheet).toHaveTextContent("Two open threads");
  });
});
