import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EditingHold } from "./editing-hold";
import { renderWithSystem as render } from "./testing";

describe("EditingHold", () => {
  it("names who is editing and since when, and takes over only once asked", async () => {
    const user = userEvent.setup();
    const onTakeOver = vi.fn();
    render(
      <EditingHold
        state="held"
        holder="Salama Ashoush"
        since="10:42"
        onTakeOver={onTakeOver}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Salama Ashoush has been editing this since 10:42.",
    );
    expect(
      screen.queryByRole("button", { name: "Copy my change" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Take over" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Take over from Salama Ashoush?",
    });
    expect(onTakeOver).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Take over" }));
    expect(onTakeOver).toHaveBeenCalledOnce();
  });

  it("offers a change that was not saved when it was taken to copy or compare", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onCompare = vi.fn();
    render(
      <EditingHold
        state="taken"
        holder="Salama Ashoush"
        since="10:45"
        unsaved={{ onCopy, onCompare }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Salama Ashoush took this over at 10:45. You can read it but no longer change it. Your last change was not saved.",
    );
    await user.click(screen.getByRole("button", { name: "Copy my change" }));
    await user.click(screen.getByRole("button", { name: "Compare versions" }));
    expect(onCopy).toHaveBeenCalledOnce();
    expect(onCompare).toHaveBeenCalledOnce();
  });

  it("says nothing of unsaved work when everything was saved", () => {
    render(<EditingHold state="taken" holder="Salama Ashoush" since="10:45" />);
    expect(screen.getByRole("status")).not.toHaveTextContent("not saved");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
