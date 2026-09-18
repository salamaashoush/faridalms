import { describe, expect, it } from "vitest";

import { termIssue } from "./academic-year";

const year = { startsOn: "2026-09-01", endsOn: "2027-06-30" };

describe("termIssue", () => {
  it("accepts ordered terms inside the year", () => {
    expect(
      termIssue(year, [
        { name: "Term 1", startsOn: "2026-09-01", endsOn: "2027-01-20" },
        { name: "Term 2", startsOn: "2027-02-01", endsOn: "2027-06-30" },
      ]),
    ).toBeNull();
  });

  it("refuses a term that leaves the year", () => {
    expect(
      termIssue(year, [
        { name: "Term 1", startsOn: "2026-08-20", endsOn: "2027-01-20" },
      ]),
    ).toBe("term_outside");
  });

  it("refuses terms that share a day", () => {
    expect(
      termIssue(year, [
        { name: "Term 2", startsOn: "2027-01-20", endsOn: "2027-06-30" },
        { name: "Term 1", startsOn: "2026-09-01", endsOn: "2027-01-20" },
      ]),
    ).toBe("term_overlap");
  });

  it("refuses names that differ only by case", () => {
    expect(
      termIssue(year, [
        { name: "Term 1", startsOn: "2026-09-01", endsOn: "2027-01-20" },
        { name: "term 1", startsOn: "2027-02-01", endsOn: "2027-06-30" },
      ]),
    ).toBe("term_name_conflict");
  });
});
