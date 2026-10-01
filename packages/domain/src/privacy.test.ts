import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  addMonths,
  addYears,
  extendedDueOn,
  peopleDueOn,
  peopleMustBeTold,
  regulatorDueAt,
  regulatorMustBeTold,
  requestDueOn,
  reviewDueOn,
  saveRetentionSchema,
} from "./privacy";

const none = { studentRule: null, studentValue: null, staffYears: null };

describe("addYears", () => {
  it("moves a leap day to 1 March, never earlier", () => {
    expect(addYears("2024-02-29", 1)).toBe("2025-03-01");
    expect(addYears("2020-07-15", 6)).toBe("2026-07-15");
  });
});

describe("reviewDueOn", () => {
  const student = {
    kind: "student" as const,
    leftOn: "2020-07-01",
    birthDate: "2004-03-10",
  };

  it("keeps everything while the school has set no rule", () => {
    expect(reviewDueOn(none, student)).toBeNull();
    expect(reviewDueOn(none, { ...student, kind: "staff" })).toBeNull();
  });

  it("counts years from the day a student left", () => {
    const rules = {
      ...none,
      studentRule: "years_after_leaving" as const,
      studentValue: 7,
    };
    expect(reviewDueOn(rules, student)).toBe("2027-07-01");
  });

  it("counts an age from the birth date, never before leaving", () => {
    const rules = {
      ...none,
      studentRule: "until_age" as const,
      studentValue: 25,
    };
    expect(reviewDueOn(rules, student)).toBe("2029-03-10");
    expect(reviewDueOn(rules, { ...student, leftOn: "2030-01-01" })).toBe(
      "2030-01-01",
    );
    expect(reviewDueOn(rules, { ...student, birthDate: null })).toBeNull();
  });

  it("counts staff years from the day they left", () => {
    expect(
      reviewDueOn({ ...none, staffYears: 6 }, { ...student, kind: "staff" }),
    ).toBe("2026-07-01");
  });
});

describe("saveRetentionSchema", () => {
  it("needs a value with a rule and an adult age", () => {
    expect(
      v.safeParse(saveRetentionSchema, { ...none, studentRule: "until_age" })
        .success,
    ).toBe(false);
    expect(
      v.safeParse(saveRetentionSchema, {
        ...none,
        studentRule: "until_age",
        studentValue: 16,
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(saveRetentionSchema, {
        ...none,
        studentRule: "until_age",
        studentValue: 25,
        staffYears: 6,
      }).success,
    ).toBe(true);
  });
});

// A Sunday-to-Thursday school with 1 January a public holiday.
const dayOf = (day: string) => {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  const weekend = weekday === 5 || weekday === 6;
  const holiday = day.endsWith("-01-01");
  return { school: !weekend && !holiday, working: !weekend && !holiday };
};

describe("requestDueOn", () => {
  it("gives UK GDPR a calendar month, the month's end, or the next working day", () => {
    expect(requestDueOn("uk_gdpr", "access", "2026-03-10", dayOf)).toBe(
      "2026-04-12",
    );
    expect(requestDueOn("uk_gdpr", "erasure", "2026-01-31", dayOf)).toBe(
      "2026-03-01",
    );
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("counts school and working days, never the first day", () => {
    expect(requestDueOn("egypt", "access", "2025-12-30", dayOf)).toBe(
      "2026-01-08",
    );
    expect(requestDueOn("england_record", "access", "2026-03-01", dayOf)).toBe(
      "2026-03-22",
    );
  });

  it("gives FERPA 45 days for inspection and leaves other requests to the school", () => {
    expect(requestDueOn("ferpa", "access", "2026-03-01", dayOf)).toBe(
      "2026-04-15",
    );
    expect(requestDueOn("ferpa", "correction", "2026-03-01", dayOf)).toBeNull();
    expect(requestDueOn("other", "access", "2026-03-01", dayOf)).toBeNull();
  });

  it("extends a UK request by two months", () => {
    expect(extendedDueOn("2026-04-12", dayOf)).toBe("2026-06-14");
  });
});

describe("breach notices", () => {
  it("tells Egypt's regulator of every breach, the UK's unless harmless", () => {
    expect(regulatorMustBeTold("egypt", "unlikely")).toBe(true);
    expect(regulatorMustBeTold("uk_gdpr", "unlikely")).toBe(false);
    expect(regulatorMustBeTold("uk_gdpr", "risk")).toBe(true);
    expect(peopleMustBeTold("uk_gdpr", "risk")).toBe(false);
    expect(peopleMustBeTold("uk_gdpr", "high")).toBe(true);
    expect(peopleMustBeTold("other", "high")).toBe(false);
  });

  it("gives the regulator 72 hours and Egypt's people 3 working days", () => {
    expect(regulatorDueAt("2026-10-01T09:30:00.000Z")).toBe(
      "2026-10-04T09:30:00.000Z",
    );
    expect(peopleDueOn("egypt", "2025-12-30", dayOf)).toBe("2026-01-05");
    expect(peopleDueOn("uk_gdpr", "2025-12-30", dayOf)).toBeNull();
  });
});
