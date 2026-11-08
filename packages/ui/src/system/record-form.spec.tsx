import type { ReactElement } from "react";

import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithSystem as render } from "./testing";

import type { DangerAction } from "./record-form";

import { TextField } from "./form-field";
import { FormSection, RecordForm } from "./record-form";

function inRouter(Page: () => ReactElement) {
  const router = createRouter({
    routeTree: createRootRoute({ component: Page }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

interface PersonFormProps {
  labels: string[];
  onSave: (intent: string | undefined) => void;
  danger?: DangerAction;
}

function PersonForm({ labels, onSave, danger }: PersonFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  return (
    <RecordForm
      title="Add Salama"
      isDirty={() => false}
      onCancel={() => undefined}
      secondary={{ label: "Save and add another", intent: "another" }}
      danger={danger}
      onSubmit={(intent) => {
        setSubmitted(true);
        if (labels.every((label) => values[label])) onSave(intent);
      }}
    >
      <FormSection title="Details">
        {labels.map((label) => (
          <TextField
            key={label}
            label={label}
            value={values[label] ?? ""}
            onChange={(event) =>
              setValues((previous) => ({
                ...previous,
                [label]: event.target.value,
              }))
            }
            errors={
              submitted && !values[label] ? [`Enter ${label}`] : undefined
            }
          />
        ))}
      </FormSection>
    </RecordForm>
  );
}

const SIX = ["First", "Last", "Reference", "Phone", "Email", "City"];

describe("RecordForm", () => {
  it("opens a long form's errors with a focused summary linking each field", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    document.title = "Farida LMS";
    inRouter(() => <PersonForm labels={SIX} onSave={onSave} />);
    await user.click(await screen.findByRole("button", { name: "Save" }));
    const summary = await screen.findByRole("alert");
    await waitFor(() => expect(summary).toHaveFocus());
    expect(
      within(summary).getByRole("heading", { name: "There is a problem" }),
    ).toBeInTheDocument();
    expect(within(summary).getAllByRole("link")).toHaveLength(6);
    expect(document.title).toBe("Error: Farida LMS");

    await user.click(
      within(summary).getByRole("link", { name: "City: Enter City" }),
    );
    const city = screen.getByRole("textbox", { name: "City" });
    expect(city).toHaveFocus();
    await user.type(city, "Cairo");
    await waitFor(() =>
      expect(within(summary).getAllByRole("link")).toHaveLength(5),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("focuses the first invalid field of a short form instead", async () => {
    const user = userEvent.setup();
    inRouter(() => <PersonForm labels={["First", "Last"]} onSave={vi.fn()} />);
    await user.type(
      await screen.findByRole("textbox", { name: "First" }),
      "Salama",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    const last = screen.getByRole("textbox", { name: "Last" });
    await waitFor(() => expect(last).toHaveFocus());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("leaves focus in a field the person moved to before the errors drew", async () => {
    const user = userEvent.setup();
    inRouter(() => <PersonForm labels={["First", "Last"]} onSave={vi.fn()} />);
    const last = await screen.findByRole("textbox", { name: "Last" });
    const frames: FrameRequestCallback[] = [];
    const frame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => frames.push(callback));
    await user.click(screen.getByRole("button", { name: "Save" }));
    last.focus();
    frame.mockRestore();
    await act(async () => {
      for (const callback of frames.splice(0)) callback(performance.now());
    });
    expect(last).toHaveFocus();
  });

  it("tells onSubmit which button submitted", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    inRouter(() => <PersonForm labels={["First"]} onSave={onSave} />);
    await user.type(
      await screen.findByRole("textbox", { name: "First" }),
      "Salama",
    );
    await user.click(
      screen.getByRole("button", { name: "Save and add another" }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls).toEqual([["another"], [undefined]]);
  });

  it("confirms the danger zone action before running it", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    inRouter(() => (
      <PersonForm
        labels={["First"]}
        onSave={vi.fn()}
        danger={{
          title: "Archive Salama",
          description: "Salama leaves every list.",
          label: "Archive",
          confirmTitle: "Archive Salama?",
          confirmBody: "Salama can be restored later.",
          confirmLabel: "Archive Salama",
          onConfirm,
        }}
      />
    ));
    expect(
      await screen.findByRole("heading", { name: "Danger zone" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Archive Salama?",
    });
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Archive Salama" }),
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
