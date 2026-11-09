import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ENGLISH } from "./english";
import {
  CheckboxGroupField,
  NumberField,
  optionGroups,
  SelectField,
  TextField,
} from "./form-field";
import { renderWithSystem } from "./testing";

describe("NumberField", () => {
  it("takes a figure typed in Arabic-Indic numerals as its value", async () => {
    const onChange = vi.fn<(value: number | null) => void>();
    renderWithSystem(
      <NumberField label="50th percentile" value={null} onChange={onChange} />,
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "50th percentile" }),
      "٨٣",
    );
    expect(onChange).toHaveBeenLastCalledWith(83);
  });

  it("refuses letters and more places than it allows", async () => {
    const onChange = vi.fn<(value: number | null) => void>();
    renderWithSystem(
      <NumberField
        label="Weight %"
        decimals={1}
        value={null}
        onChange={onChange}
      />,
    );
    const field = screen.getByRole("textbox", { name: "Weight %" });
    await userEvent.type(field, "1x2.55");
    expect(field).toHaveValue("12.5");
    expect(onChange).toHaveBeenLastCalledWith(12.5);
  });
});

describe("TextField", () => {
  it("marks an optional field beside its label, keeping the label its name", () => {
    renderWithSystem(<TextField label="Phone" optional value="" readOnly />);
    expect(screen.getByRole("textbox", { name: "Phone" })).toBeInTheDocument();
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("shows an issue in the reader's language and ties it to the control", () => {
    renderWithSystem(
      <TextField
        label="Email"
        value=""
        readOnly
        errors={[{ message: "validation.email" }]}
      />,
      {
        system: {
          ...ENGLISH,
          issueMessage: (issue) =>
            issue.message === "validation.email" ? "Enter an email" : "",
        },
      },
    );
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter an email");
  });
});

describe("fields side by side", () => {
  it("keep their controls level: a hint goes under its control, not above", () => {
    renderWithSystem(
      <div>
        <TextField label="Cell" value="eg-1" onChange={() => undefined} />
        <TextField
          label="Jurisdictions"
          hint="Country codes whose rules apply, separated by commas."
          value="EG"
          onChange={() => undefined}
        />
      </div>,
    );
    const control = screen.getByRole("textbox", { name: "Jurisdictions" });
    const hint = screen.getByText(
      "Country codes whose rules apply, separated by commas.",
    );
    expect(control.compareDocumentPosition(hint)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(control).toHaveAccessibleDescription(
      "Country codes whose rules apply, separated by commas.",
    );
  });

  it("put an error where the hint was", () => {
    renderWithSystem(
      <TextField
        label="Jurisdictions"
        hint="Country codes whose rules apply, separated by commas."
        value=""
        errors={[{ message: "Enter at least one country." }]}
        onChange={() => undefined}
      />,
    );
    const control = screen.getByRole("textbox", { name: "Jurisdictions" });
    expect(control).toHaveAccessibleDescription("Enter at least one country.");
    expect(
      screen.queryByText("Country codes whose rules apply, separated by commas."),
    ).not.toBeInTheDocument();
  });
});

describe("CheckboxGroupField", () => {
  it("keeps a hidden legend as the group's name", () => {
    renderWithSystem(
      <CheckboxGroupField
        label="Modules"
        labelHidden
        value={[]}
        options={[{ value: "coding", label: "Coding" }]}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("group", { name: "Modules" })).toBeInTheDocument();
    expect(screen.getByText("Modules")).toHaveClass("sr-only");
  });

  it("names its choices by their legend and keeps their order when one is added", async () => {
    const onChange = vi.fn<(value: string[]) => void>();
    renderWithSystem(
      <CheckboxGroupField
        label="Modules"
        value={["video"]}
        options={[
          { value: "coding", label: "Coding" },
          { value: "video", label: "Video" },
        ]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("group", { name: "Modules" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Video" })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Coding" }));
    expect(onChange).toHaveBeenCalledWith(["coding", "video"]);
  });
});

describe("option groups", () => {
  it("gather options under their headings, in the order each first comes", () => {
    expect(
      optionGroups([
        { value: "a", label: "7A", group: "Yours" },
        { value: "b", label: "7B", group: "Others" },
        { value: "c", label: "8A", group: "Yours" },
      ]),
    ).toEqual([
      {
        group: "Yours",
        options: [
          { value: "a", label: "7A", group: "Yours" },
          { value: "c", label: "8A", group: "Yours" },
        ],
      },
      { group: "Others", options: [{ value: "b", label: "7B", group: "Others" }] },
    ]);
  });

  it("list a select's options under their headings", async () => {
    renderWithSystem(
      <SelectField
        label="Class"
        value="a"
        options={[
          { value: "a", label: "7A", group: "Your classes" },
          { value: "b", label: "7B", group: "Other classes" },
        ]}
        onChange={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole("combobox", { name: /Class/ }));
    expect(
      await screen.findByRole("group", { name: "Your classes" }),
    ).toHaveTextContent("7A");
    expect(screen.getByRole("group", { name: "Other classes" })).toHaveTextContent(
      "7B",
    );
  });
});
