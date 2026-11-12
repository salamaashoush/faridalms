import * as v from "valibot";

import type { SchoolStanding } from "./provisioning";

import { addDays, daysBetween, schoolDate } from "./school";
import { isoWeekday } from "./school-days";

/**
 * The steps an unpaid invoice passes through, by days after it fell due:
 * reminders, then a notice before each change to what the school may do,
 * then the change, and at the end the contract.
 */
export const DUNNING_STEPS = [
  "upcoming",
  "due",
  "overdue_7",
  "overdue_14",
  "restrict_notice",
  "restricted",
  "read_only_notice",
  "read_only",
  "suspend_notice",
  "suspended",
  "ended",
] as const;
export type DunningStep = (typeof DUNNING_STEPS)[number];

export const STEP_DAY: Record<DunningStep, number> = {
  upcoming: -7,
  due: 0,
  overdue_7: 7,
  overdue_14: 14,
  restrict_notice: 21,
  restricted: 30,
  read_only_notice: 45,
  read_only: 60,
  suspend_notice: 75,
  suspended: 90,
  ended: 120,
};

/** The steps that change what the school may do, and to what. */
export const STEP_STANDING: Partial<Record<DunningStep, SchoolStanding>> = {
  restricted: "restricted",
  read_only: "read_only",
  suspended: "suspended",
};

/** The change each notice warns of. */
export const NOTICE_OF: Partial<Record<DunningStep, DunningStep>> = {
  restrict_notice: "restricted",
  read_only_notice: "read_only",
  suspend_notice: "suspended",
};

const SEVERITY: Record<SchoolStanding, number> = {
  full: 0,
  restricted: 1,
  read_only: 2,
  suspended: 3,
};

/** Whether the first standing takes more away from a school than the second. */
export const severer = (a: SchoolStanding, b: SchoolStanding) =>
  SEVERITY[a] > SEVERITY[b];

/** A stop of a customer's clock, both days included. */
export interface DunningPause {
  startsOn: string;
  endsOn: string;
}

/** What the clock needs of an invoice. */
export interface DunningInvoice {
  dueOn: string;
  totalMinor: number;
  owedMinor: number;
}

/**
 * Days since the invoice fell due, not counting a day the customer's clock
 * was paused; negative before it is due.
 */
export function clockDays(
  invoice: Pick<DunningInvoice, "dueOn">,
  pauses: readonly DunningPause[],
  today: string,
): number {
  const elapsed = daysBetween(invoice.dueOn, today) - 1;
  if (elapsed <= 0) return elapsed;
  const first = addDays(invoice.dueOn, 1);
  const paused = new Set<string>();
  for (const pause of pauses) {
    const from = pause.startsOn > first ? pause.startsOn : first;
    const to = pause.endsOn < today ? pause.endsOn : today;
    for (let day = from; day <= to; day = addDays(day, 1)) paused.add(day);
  }
  return elapsed - paused.size;
}

/**
 * Where an unpaid invoice stands on the clock today, or null when it is
 * paid or more than a week from due. Paying at least half of it moves an
 * overdue invoice back one step.
 */
export function dunningStep(
  invoice: DunningInvoice,
  pauses: readonly DunningPause[],
  today: string,
): DunningStep | null {
  if (invoice.owedMinor <= 0) return null;
  const days = clockDays(invoice, pauses, today);
  let index = DUNNING_STEPS.findLastIndex((step) => STEP_DAY[step] <= days);
  if (index < 0) return null;
  const halfPaid =
    (invoice.totalMinor - invoice.owedMinor) * 2 >= invoice.totalMinor;
  if (halfPaid && index > DUNNING_STEPS.indexOf("due")) index -= 1;
  return DUNNING_STEPS[index] ?? null;
}

/** What a school may do while one of its invoices is at this step. */
export function standingAt(step: DunningStep | null): SchoolStanding {
  if (step === null) return "full";
  const index = DUNNING_STEPS.indexOf(step);
  const reached = DUNNING_STEPS.findLast(
    (candidate, at) => at <= index && STEP_STANDING[candidate],
  );
  return reached ? (STEP_STANDING[reached] ?? "full") : "full";
}

/** Whether a step tells the school's administrators a payment is overdue. */
export const showsOverdue = (step: DunningStep | null) =>
  step !== null &&
  DUNNING_STEPS.indexOf(step) >= DUNNING_STEPS.indexOf("overdue_14");

/**
 * Whether it is the weekend now at every one of a tenant's schools, each in
 * its own time zone, so access changes between school days. Schools whose
 * weekends share no weekday wait only for their own.
 */
export function weekendNow(
  schools: readonly { timeZone: string; weekendDays: readonly number[] }[],
  now: Date,
): boolean {
  if (schools.length === 0) return true;
  const atWeekend = schools.map((school) =>
    school.weekendDays.includes(isoWeekday(schoolDate(school.timeZone, now))),
  );
  const shared = [1, 2, 3, 4, 5, 6, 7].some((day) =>
    schools.every((school) => school.weekendDays.includes(day)),
  );
  return shared ? atWeekend.every(Boolean) : atWeekend.some(Boolean);
}

/** How long ago an amount owed fell due, as receivables are aged. */
export const AGING_BUCKETS = [
  "current",
  "days_1_30",
  "days_31_60",
  "days_61_90",
  "over_90",
] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "days_1_30";
  if (daysOverdue <= 60) return "days_31_60";
  if (daysOverdue <= 90) return "days_61_90";
  return "over_90";
}

const isoDay = v.pipe(v.string(), v.isoDate());

/** An operator stopping a customer's clock, until a day, and why. */
export const dunningPauseSchema = v.pipe(
  v.object({
    customerId: v.pipe(v.string(), v.uuid()),
    startsOn: isoDay,
    endsOn: isoDay,
    reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
  }),
  v.check(
    (input) => input.endsOn >= input.startsOn,
    "A pause ends on or after the day it starts.",
  ),
);
export type DunningPauseInput = v.InferOutput<typeof dunningPauseSchema>;
