import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  saveYearSchema,
  termIssue,
  yearStanding,
  yearTransitionIssue,
} from "./years";

const year = { startsOn: "2026-09-01", endsOn: "2027-06-30" };
const term = (titleEn: string, startsOn: string, endsOn: string) => ({
  titleEn,
  titleAr: null,
  startsOn,
  endsOn,
});

describe("termIssue", () => {
  it("accepts ordered terms inside the year", () => {
    expect(
      termIssue(year, [
        term("Term 1", "2026-09-01", "2027-01-20"),
        term("Term 2", "2027-02-01", "2027-06-30"),
      ]),
    ).toBeNull();
  });

  it("refuses a term that leaves the year", () => {
    expect(termIssue(year, [term("Term 1", "2026-08-20", "2027-01-20")])).toBe(
      "term_outside",
    );
  });

  it("refuses terms that share a day", () => {
    expect(
      termIssue(year, [
        term("Term 2", "2027-01-20", "2027-06-30"),
        term("Term 1", "2026-09-01", "2027-01-20"),
      ]),
    ).toBe("term_overlap");
  });

  it("refuses names that differ only by case, in either language", () => {
    expect(
      termIssue(year, [
        term("Term 1", "2026-09-01", "2027-01-20"),
        term("term 1", "2027-02-01", "2027-06-30"),
      ]),
    ).toBe("term_name_conflict");
    expect(
      termIssue(year, [
        { ...term("Term 1", "2026-09-01", "2027-01-20"), titleAr: "الأول" },
        { ...term("Term 2", "2027-02-01", "2027-06-30"), titleAr: "الأول" },
      ]),
    ).toBe("term_name_conflict");
  });
});

describe("saveYearSchema", () => {
  it("names the field a person must fix", () => {
    const result = v.safeParse(saveYearSchema, {
      titleEn: " ",
      startsOn: "2027-06-30",
      endsOn: "2026-09-01",
      terms: [],
    });
    expect(result.success).toBe(false);
    expect(
      result.issues?.map((issue) => [
        issue.path?.map((item) => item.key).join("."),
        issue.message,
      ]),
    ).toEqual([
      ["titleEn", "validation.name_required"],
      ["endsOn", "validation.end_date"],
    ]);
  });
});

describe("yearTransitionIssue", () => {
  const none = { reason: "" };

  it("makes an upcoming year current and closes an upcoming one", () => {
    expect(yearTransitionIssue("upcoming", "make_current", none)).toBeNull();
    expect(yearTransitionIssue("upcoming", "close", none)).toBeNull();
  });

  it("refuses skipping or repeating a step", () => {
    expect(yearTransitionIssue("closed", "make_current", none)).toBe(
      "school_year.transition",
    );
    expect(yearTransitionIssue("current", "make_current", none)).toBe(
      "school_year.transition",
    );
    expect(yearTransitionIssue("closed", "close", none)).toBe(
      "school_year.transition",
    );
    expect(yearTransitionIssue("upcoming", "reopen", { reason: "x" })).toBe(
      "school_year.transition",
    );
  });

  it("keeps the current year open until another replaces it", () => {
    expect(yearTransitionIssue("current", "close", none)).toBe(
      "school_year.current_closing",
    );
  });

  it("reopens a closed year only with a reason", () => {
    expect(yearTransitionIssue("closed", "reopen", { reason: " " })).toBe(
      "school_year.reason_required",
    );
    expect(
      yearTransitionIssue("closed", "reopen", {
        reason: "Correct a mistyped grade",
      }),
    ).toBeNull();
  });
});

describe("yearStanding", () => {
  it("calls a reopened past year open rather than upcoming", () => {
    expect(
      yearStanding(
        { lifecycle: "upcoming", startsOn: "2027-09-01" },
        "2026-10-01",
      ),
    ).toBe("upcoming");
    expect(
      yearStanding(
        { lifecycle: "upcoming", startsOn: "2025-09-01" },
        "2026-10-01",
      ),
    ).toBe("open");
    expect(
      yearStanding(
        { lifecycle: "closed", startsOn: "2025-09-01" },
        "2026-10-01",
      ),
    ).toBe("closed");
  });
});
