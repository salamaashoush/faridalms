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

/** The law a records request is answered under, which sets its clock. */
export const REQUEST_LAWS = [
  "uk_gdpr",
  "england_record",
  "ferpa",
  "egypt",
  "other",
] as const;
export type RequestLaw = (typeof REQUEST_LAWS)[number];

export const REQUEST_KINDS = [
  "access",
  "correction",
  "erasure",
  "objection",
] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_RELATIONS = [
  "self",
  "parent",
  "representative",
  "authority",
] as const;
export type RequestRelation = (typeof REQUEST_RELATIONS)[number];

export const REQUEST_OUTCOMES = ["completed", "refused", "withdrawn"] as const;
export type RequestOutcome = (typeof REQUEST_OUTCOMES)[number];

/** What a day is for the school: a day lessons are held, a working day. */
export interface DayKind {
  school: boolean;
  working: boolean;
}

/**
 * The calendar date a month on, or the month's last day when it has no such
 * date: 31 January gives 28 or 29 February (ICO, time limits).
 */
export function addMonths(iso: string, months: number): string {
  const [year = 0, month = 1, day = 1] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

function plusDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function countForward(
  from: string,
  count: number,
  counts: (day: string) => boolean,
): string {
  let day = from;
  for (let left = count; left > 0;) {
    day = plusDays(day, 1);
    if (counts(day)) left -= 1;
  }
  return day;
}

function nextWorking(iso: string, dayOf: (day: string) => DayKind): string {
  let day = iso;
  while (!dayOf(day).working) day = plusDays(day, 1);
  return day;
}

/** Whether the law sets a deadline for this kind of request. */
export function hasClock(law: RequestLaw, kind: RequestKind): boolean {
  if (law === "other") return false;
  if (law === "england_record" || law === "ferpa") return kind === "access";
  return true;
}

/**
 * The day a request must be answered by, counted from the day its clock
 * starts: UK GDPR one calendar month, moved to the next working day when it
 * ends on a weekend or holiday (Art. 12(3), ICO); an English parent's request
 * for the educational record 15 school days (Education (Pupil Information)
 * (England) Regulations 2005, reg. 5); FERPA 45 days (34 CFR 99.10(b));
 * Egypt 6 working days (Law 151/2020). Null where the law sets none and the
 * school enters the date itself.
 */
export function requestDueOn(
  law: RequestLaw,
  kind: RequestKind,
  clockFrom: string,
  dayOf: (day: string) => DayKind,
): string | null {
  if (!hasClock(law, kind)) return null;
  switch (law) {
    case "uk_gdpr":
      return nextWorking(addMonths(clockFrom, 1), dayOf);
    case "england_record":
      return countForward(clockFrom, 15, (day) => dayOf(day).school);
    case "ferpa":
      return plusDays(clockFrom, 45);
    case "egypt":
      return countForward(clockFrom, 6, (day) => dayOf(day).working);
    default:
      return null;
  }
}

/** UK GDPR lets a complex request run two months longer (Art. 12(3)). */
export function extendedDueOn(
  dueOn: string,
  dayOf: (day: string) => DayKind,
): string {
  return nextWorking(addMonths(dueOn, 2), dayOf);
}

const isoDay = v.pipe(v.string(), v.isoDate());
const note = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));

export const saveRequestSchema = v.pipe(
  v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    subjectUserId: v.pipe(v.string(), v.uuid()),
    requestedBy: note(120),
    relation: v.picklist(REQUEST_RELATIONS),
    kind: v.picklist(REQUEST_KINDS),
    law: v.picklist(REQUEST_LAWS),
    receivedOn: isoDay,
    clockFrom: isoDay,
    /** Only where the law sets no clock. */
    dueOn: v.nullable(isoDay),
    details: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000)), ""),
  }),
  v.check(
    (input) => input.clockFrom >= input.receivedOn,
    "privacy.clock_before_receipt",
  ),
  v.check(
    (input) =>
      hasClock(input.law, input.kind) ||
      (input.dueOn !== null && input.dueOn >= input.clockFrom),
    "privacy.due_needed",
  ),
);

export const extendRequestSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  reason: note(500),
});

export const closeRequestSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  outcome: v.picklist(REQUEST_OUTCOMES),
  note: note(1000),
});
