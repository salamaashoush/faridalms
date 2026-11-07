import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithSystem as render } from "./testing";
import { VersionCompare } from "./version-compare";

describe("VersionCompare", () => {
  it("shows both versions and keeps the one chosen", async () => {
    const user = userEvent.setup();
    const onKeepMine = vi.fn();
    const onKeepSaved = vi.fn();
    render(
      <VersionCompare
        open
        onOpenChange={() => undefined}
        reason="stale"
        mine={<p>Trip on Thursday</p>}
        saved={<p>Trip on Friday</p>}
        onKeepMine={onKeepMine}
        onKeepSaved={onKeepSaved}
      />,
    );
    expect(
      await screen.findByRole("dialog", { name: "Compare versions" }),
    ).toHaveTextContent("Someone saved this while you were changing it");
    expect(
      screen.getByRole("region", { name: "Yours, not saved" }),
    ).toHaveTextContent("Trip on Thursday");
    expect(screen.getByRole("region", { name: "Saved" })).toHaveTextContent(
      "Trip on Friday",
    );
    await user.click(screen.getByRole("button", { name: "Keep mine" }));
    await user.click(
      screen.getByRole("button", { name: "Keep the saved one" }),
    );
    expect(onKeepMine).toHaveBeenCalledOnce();
    expect(onKeepSaved).toHaveBeenCalledOnce();
  });

  it("names who took it over and keeps mine by taking it back", async () => {
    render(
      <VersionCompare
        open
        onOpenChange={() => undefined}
        reason="taken"
        holder="Salama Ashoush"
        mine={<p>Trip on Thursday</p>}
        saved={<p>Trip on Friday</p>}
        onKeepMine={() => undefined}
        onKeepSaved={() => undefined}
      />,
    );
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Salama Ashoush took this over before your change was saved.",
    );
    expect(
      screen.getByRole("button", { name: "Take over and keep mine" }),
    ).toBeEnabled();
  });

  it("waits for the saved version before either can be kept", async () => {
    render(
      <VersionCompare
        open
        onOpenChange={() => undefined}
        reason="stale"
        mine={<p>Trip on Thursday</p>}
        saved={null}
        onKeepMine={() => undefined}
        onKeepSaved={() => undefined}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Keep mine" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Keep the saved one" }),
    ).toBeDisabled();
  });
});
