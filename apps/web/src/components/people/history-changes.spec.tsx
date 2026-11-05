import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HistoryChanges } from "./history-changes";

describe("HistoryChanges", () => {
  it("words each changed field with its old and new value", () => {
    render(
      <HistoryChanges
        changes={[
          {
            field: "core.users.given_name_en",
            kind: "text",
            before: "Salama",
            after: "Salam",
          },
          {
            field: "core.user_relationships.portal_access",
            kind: "boolean",
            before: false,
            after: true,
          },
          {
            field: "core.user_relationships.pickup",
            kind: "choice",
            before: "allowed",
            after: "ask_office",
          },
          {
            field: "core.users.preferred_given_name",
            kind: "text",
            before: null,
            after: "Sam",
          },
        ]}
      />,
    );
    const terms = screen.getAllByRole("term").map((term) => term.textContent);
    expect(terms).toEqual([
      "First name in English",
      "Sees the student in the family app",
      "May collect the student",
      "Preferred name",
    ]);
    const values = screen
      .getAllByRole("definition")
      .map((value) => value.textContent);
    expect(values[0]).toBe("wasSalamanowSalam");
    expect(values[1]).toBe("wasNonowYes");
    expect(values[2]).toBe("wasYesnowAsk the office first");
    expect(values[3]).toBe("wasBlanknowSam");
  });

  it("shows nothing when an entry changed no field it may show", () => {
    const { container } = render(<HistoryChanges changes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
