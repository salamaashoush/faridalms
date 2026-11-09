import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithSystem as render } from "./testing";

import { ActionMenu } from "./action-menu";

const confirm = {
  title: "Delete Salama's draft?",
  body: "This cannot be undone.",
  label: "Delete",
};

async function confirmDelete(onSelect: () => Promise<unknown>) {
  const user = userEvent.setup();
  render(
    <ActionMenu
      label="More actions"
      actions={[
        { label: "Delete draft", destructive: true, confirm, onSelect },
      ]}
    />,
  );
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Delete draft" }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: "Delete" }));
  return dialog;
}

describe("ActionMenu", () => {
  it("keeps the confirmation open and shows why a destructive action failed", async () => {
    const onSelect = vi.fn(() =>
      Promise.reject(new Error("Salama's draft is locked")),
    );
    const dialog = await confirmDelete(onSelect);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Salama's draft is locked",
    );
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("confirms a regular action without the destructive colour", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn(() => Promise.resolve());
    render(
      <ActionMenu
        label="More actions"
        actions={[
          {
            label: "Use calculated grades",
            confirm: {
              title: "Use the calculated grades?",
              body: "Comments stay as they are.",
              label: "Use calculated grades",
            },
            onSelect,
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Use calculated grades" }),
    );
    const button = await screen.findByRole("button", {
      name: "Use calculated grades",
    });
    expect(button).toHaveClass("bg-primary");
    await user.click(button);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("closes the confirmation once the action succeeds", async () => {
    const onSelect = vi.fn(() => Promise.resolve());
    await confirmDelete(onSelect);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
