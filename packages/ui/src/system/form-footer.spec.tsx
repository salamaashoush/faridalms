import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormFooter } from "./form-footer";
import { renderWithSystem } from "./testing";

describe("FormFooter", () => {
  it("says what went wrong above the buttons", () => {
    renderWithSystem(
      <form>
        <FormFooter
          submitLabel="Save and continue"
          pending={false}
          error="The draft changed elsewhere."
        />
      </form>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The draft changed elsewhere.",
    );
    expect(
      screen.getByRole("button", { name: "Save and continue" }),
    ).toBeEnabled();
  });
});
