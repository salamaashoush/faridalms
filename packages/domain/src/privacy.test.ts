import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { addYears, reviewDueOn, saveRetentionSchema } from "./privacy";

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
