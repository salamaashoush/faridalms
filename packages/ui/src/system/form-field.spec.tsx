import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ENGLISH } from "./english";
import { TextField } from "./form-field";
import { renderWithSystem } from "./testing";

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
