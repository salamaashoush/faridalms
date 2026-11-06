import type { ReactElement } from "react";

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithSystem as render } from "./testing";

import { TextField } from "./form-field";
import { SettingsPage, SettingsSection } from "./settings-section";

function inRouter(Page: () => ReactElement) {
  const root = createRootRoute({ component: Outlet });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/", component: Page }),
      createRoute({
        getParentRoute: () => root,
        path: "/elsewhere",
        component: () => <p>Elsewhere</p>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

interface NameSectionProps {
  title: string;
  label: string;
  onSave: (value: string) => void;
  error?: string;
  saved?: boolean;
}

function NameSection({ title, label, onSave, error, saved }: NameSectionProps) {
  const [value, setValue] = useState("Salama");
  const [submitted, setSubmitted] = useState(false);
  return (
    <SettingsSection
      title={title}
      onSubmit={() => {
        setSubmitted(true);
        if (value) onSave(value);
      }}
      error={error}
      saved={saved}
      isDirty={() => value !== "Salama"}
    >
      <TextField
        label={label}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        errors={submitted && !value ? [`Enter ${label}`] : undefined}
      />
    </SettingsSection>
  );
}

interface TwoSectionsProps {
  onProfile?: (value: string) => void;
  onContact?: (value: string) => void;
  error?: string;
  saved?: boolean;
}

function TwoSections({
  onProfile = vi.fn(),
  onContact = vi.fn(),
  error,
  saved,
}: TwoSectionsProps) {
  return (
    <SettingsPage>
      <NameSection
        title="School profile"
        label="School name"
        onSave={onProfile}
        error={error}
        saved={saved}
      />
      <NameSection title="Contact" label="Contact name" onSave={onContact} />
    </SettingsPage>
  );
}

describe("SettingsSection", () => {
  it("saves its own fields and leaves another section's edits alone", async () => {
    const user = userEvent.setup();
    const onProfile = vi.fn();
    const onContact = vi.fn();
    inRouter(() => <TwoSections onProfile={onProfile} onContact={onContact} />);
    const profile = await screen.findByRole("form", { name: "School profile" });
    const name = within(profile).getByRole("textbox", { name: "School name" });
    await user.clear(name);
    await user.type(name, "Salama School");
    await user.type(
      screen.getByRole("textbox", { name: "Contact name" }),
      " Ashoush",
    );
    await user.click(within(profile).getByRole("button", { name: "Save" }));
    expect(onProfile).toHaveBeenCalledWith("Salama School");
    expect(onContact).not.toHaveBeenCalled();
  });

  it("focuses the first invalid field after a save", async () => {
    const user = userEvent.setup();
    const onProfile = vi.fn();
    inRouter(() => <TwoSections onProfile={onProfile} />);
    const profile = await screen.findByRole("form", { name: "School profile" });
    const name = within(profile).getByRole("textbox", { name: "School name" });
    await user.clear(name);
    await user.click(within(profile).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(onProfile).not.toHaveBeenCalled();
  });

  it("shows a server error in the card and the saved note beside Save", async () => {
    inRouter(() => <TwoSections error="The school could not be saved" saved />);
    const profile = await screen.findByRole("form", { name: "School profile" });
    expect(within(profile).getByRole("alert")).toHaveTextContent(
      "The school could not be saved",
    );
    expect(within(profile).getByText("Saved")).toBeInTheDocument();
    const contact = screen.getByRole("form", { name: "Contact" });
    expect(within(contact).queryByRole("alert")).toBeNull();
    expect(within(contact).queryByText("Saved")).toBeNull();
  });

  it("asks once before leaving when two sections have unsaved changes", async () => {
    const user = userEvent.setup();
    const router = inRouter(() => <TwoSections />);
    await user.type(
      await screen.findByRole("textbox", { name: "School name" }),
      " School",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Contact name" }),
      " Ashoush",
    );
    router.history.push("/elsewhere");
    const dialog = await screen.findByRole("dialog", {
      name: "Leave without saving?",
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.click(
      within(dialog).getByRole("button", { name: "Discard changes" }),
    );
    expect(await screen.findByText("Elsewhere")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
