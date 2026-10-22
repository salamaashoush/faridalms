import * as v from "valibot";

/**
 * Access arrangements: what a school grants a student so a timed test or a
 * deadline measures what they know rather than what they cannot do in the
 * time. Exam boards grant extra time as a share of the time allowed, most
 * often 25% or 50%, with 10% and double time used too, a computer reader,
 * and supervised rest breaks, which stop the clock while the candidate
 * rests. Set once on the student's record, they apply to every quiz and
 * assignment of theirs.
 */

/** Extra time as a share of a quiz's time limit, in percent. */
export const EXTRA_TIMES = [0, 10, 25, 50, 100] as const;
export type ExtraTime = (typeof EXTRA_TIMES)[number];
export const MAX_EXTENSION_DAYS = 14;

const id = v.pipe(v.string(), v.uuid());

export const arrangementsSchema = v.object({
  extraTime: v.picklist(EXTRA_TIMES),
  /** As long as the student needs: a timed quiz runs without a clock. */
  unlimitedTime: v.boolean(),
  /** The browser's voice reads questions and their choices aloud. */
  readAloud: v.boolean(),
  /** A choice question shows one wrong option fewer. */
  fewerChoices: v.boolean(),
  /**
   * Supervised rest breaks: during a timed quiz the student may stop the
   * clock to rest, their questions hidden, and take up again where they
   * were. Absent from arrangements kept before it existed.
   */
  restBreaks: v.optional(v.boolean(), false),
  /** Days added to every due date the student is set. */
  extensionDays: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(MAX_EXTENSION_DAYS),
  ),
});
export type Arrangements = v.InferOutput<typeof arrangementsSchema>;

export const NO_ARRANGEMENTS: Arrangements = {
  extraTime: 0,
  unlimitedTime: false,
  readAloud: false,
  fewerChoices: false,
  restBreaks: false,
  extensionDays: 0,
};

export const saveArrangementsSchema = v.object({
  studentId: id,
  /** 0 for a student with none kept yet. */
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
  arrangements: arrangementsSchema,
});
export type SaveArrangements = v.InferOutput<typeof saveArrangementsSchema>;

export const arrangementsRefSchema = v.object({ studentId: id });

/** Whether a student's arrangements change anything at all. */
export const hasArrangements = (arrangements: Arrangements) =>
  arrangements.extraTime > 0 ||
  arrangements.unlimitedTime ||
  arrangements.readAloud ||
  arrangements.fewerChoices ||
  arrangements.restBreaks ||
  arrangements.extensionDays > 0;

/**
 * The minutes a timed quiz gives a student: its limit with their extra time,
 * rounded up to the whole minute, or null for as long as they need.
 */
export function allowedMinutes(
  limit: number,
  arrangements: Pick<Arrangements, "extraTime" | "unlimitedTime">,
): number | null {
  if (arrangements.unlimitedTime) return null;
  return Math.ceil((limit * (100 + arrangements.extraTime)) / 100);
}
