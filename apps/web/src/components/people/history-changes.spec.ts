import { describe, expect, it } from "vitest";

import { fieldChanges } from "./history-changes";

describe("fieldChanges", () => {
  it("words each changed field with its old and new value", () => {
    expect(
      fieldChanges([
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
      ]),
    ).toEqual([
      {
        field: "First name in English",
        before: "Salama",
        after: "Salam",
        beforeBlank: false,
        ltr: false,
      },
      {
        field: "Sees the student in the family app",
        before: "No",
        after: "Yes",
        beforeBlank: false,
        ltr: false,
      },
      {
        field: "May collect the student",
        before: "Yes",
        after: "Ask the office first",
        beforeBlank: false,
        ltr: false,
      },
      {
        field: "Preferred name",
        before: "Blank",
        after: "Sam",
        beforeBlank: true,
        ltr: false,
      },
    ]);
  });
});
