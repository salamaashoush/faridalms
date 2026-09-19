import { describe, expect, it } from "vitest";

import { yearTransitionIssue } from "./academic-year";

const open = { isDefault: false, reason: "" };

describe("yearTransitionIssue", () => {
  it("moves a year from planning to teaching to closed", () => {
    expect(yearTransitionIssue("planning", "active", open)).toBeNull();
    expect(yearTransitionIssue("active", "closed", open)).toBeNull();
  });

  it("refuses skipping or reversing a step", () => {
    expect(yearTransitionIssue("planning", "closed", open)).toBe(
      "academic_year.transition",
    );
    expect(yearTransitionIssue("active", "planning", open)).toBe(
      "academic_year.transition",
    );
    expect(yearTransitionIssue("active", "active", open)).toBe(
      "academic_year.transition",
    );
  });

  it("keeps the default year open", () => {
    expect(
      yearTransitionIssue("active", "closed", { isDefault: true, reason: "" }),
    ).toBe("academic_year.default_closing");
  });

  it("reopens a closed year only with a reason", () => {
    expect(yearTransitionIssue("closed", "active", open)).toBe(
      "academic_year.reason_required",
    );
    expect(
      yearTransitionIssue("closed", "active", {
        isDefault: false,
        reason: "Correct a mistyped grade",
      }),
    ).toBeNull();
  });
});
