import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithSystem as render } from "./testing";

import { TextField } from "./form-field";
import { SheetForm, useSheet } from "./sheet-form";

interface NameSheetProps {
  onSave: (name: string) => void;
}

function NameSheet({ onSave }: NameSheetProps) {
  const [first, setFirst] = useState("Salama");
  const [last, setLast] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [open, setOpen] = useState(true);
  return (
    <SheetForm
      open={open}
      onOpenChange={setOpen}
      title="Edit Salama's details"
      onSubmit={() => {
        setSubmitted(true);
        if (first && last) onSave(`${first} ${last}`);
      }}
    >
      <TextField
        label="First name"
        value={first}
        onChange={(event) => setFirst(event.target.value)}
        errors={submitted && !first ? ["Enter a first name"] : undefined}
      />
      <TextField
        label="Last name"
        value={last}
        onChange={(event) => setLast(event.target.value)}
        errors={submitted && !last ? ["Enter a last name"] : undefined}
      />
    </SheetForm>
  );
}

describe("SheetForm", () => {
  it("keeps the sheet open and moves focus to the first invalid field", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<NameSheet onSave={onSave} />);
    const sheet = await screen.findByRole("dialog", {
      name: "Edit Salama's details",
    });
    expect(
      screen.getByRole("form", { name: "Edit Salama's details" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    const last = screen.getByRole("textbox", { name: "Last name" });
    await waitFor(() => expect(last).toHaveFocus());
    expect(last).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a last name")).toBeInTheDocument();
    expect(sheet).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("names its close button in the interface language", async () => {
    const user = userEvent.setup();
    render(<NameSheet onSave={vi.fn()} />);
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("starts each opening from the record, not from what was abandoned", async () => {
    render(<RenameRecord />);
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const name = screen.getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Abandoned");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
      "Northwind",
    );
  });
});

interface RenameSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function RenameSheet({ open, onOpenChange }: RenameSheetProps) {
  const [name, setName] = useState("Northwind");
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Rename"
      onSubmit={() => onOpenChange(false)}
    >
      <TextField
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
    </SheetForm>
  );
}

function RenameRecord() {
  const sheet = useSheet();
  return (
    <>
      <button type="button" onClick={sheet.show}>
        Rename
      </button>
      <RenameSheet
        key={sheet.key}
        open={sheet.open}
        onOpenChange={sheet.onOpenChange}
      />
    </>
  );
}
