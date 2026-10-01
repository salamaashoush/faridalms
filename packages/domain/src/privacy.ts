import * as v from "valibot";

export const STUDENT_RETENTION = ["years_after_leaving", "until_age"] as const;
export type StudentRetention = (typeof STUDENT_RETENTION)[number];

export interface RetentionRules {
  studentRule: StudentRetention | null;
  studentValue: number | null;
  staffYears: number | null;
}

const whole = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));

export const saveRetentionSchema = v.pipe(
  v.object({
    studentRule: v.nullable(v.picklist(STUDENT_RETENTION)),
    studentValue: v.nullable(whole(1, 100)),
    staffYears: v.nullable(whole(1, 100)),
  }),
  v.check(
    (input) => (input.studentRule === null) === (input.studentValue === null),
    "privacy.student_rule_incomplete",
  ),
  v.check(
    (input) =>
      input.studentRule !== "until_age" || (input.studentValue ?? 0) >= 18,
    "privacy.age_too_young",
  ),
);

export const placeHoldSchema = v.object({
  subjectUserId: v.pipe(v.string(), v.uuid()),
  reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
});

export const releaseHoldSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
});

/**
 * `2026-02-28` moved by whole years. A 29 February lands on 1 March, the
 * later day, so a record is never due before its time.
 */
export function addYears(iso: string, years: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

/**
 * The day a leaver's records are due for review under the school's rules,
 * or null when the rules keep them (no rule, or an age rule with no birth
 * date to count from).
 */
export function reviewDueOn(
  rules: RetentionRules,
  person: {
    kind: "student" | "staff";
    leftOn: string;
    birthDate: string | null;
  },
): string | null {
  if (person.kind === "staff")
    return rules.staffYears === null
      ? null
      : addYears(person.leftOn, rules.staffYears);
  if (rules.studentRule === null || rules.studentValue === null) return null;
  if (rules.studentRule === "years_after_leaving")
    return addYears(person.leftOn, rules.studentValue);
  if (person.birthDate === null) return null;
  const byAge = addYears(person.birthDate, rules.studentValue);
  return byAge > person.leftOn ? byAge : person.leftOn;
}
