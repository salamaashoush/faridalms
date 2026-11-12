import * as v from "valibot";

import type { YearLifecycle } from "./years";

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const title = v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120)), "");

export const NEXT_YEAR_OUTCOMES = [
  "promote",
  "retain",
  "leave",
  "graduate",
] as const;
export type NextYearOutcome = (typeof NEXT_YEAR_OUTCOMES)[number];

/** What a family says of a student's next year when the school asks. */
export const NEXT_YEAR_INTENTIONS = [
  "returning",
  "undecided",
  "leaving",
] as const;
export type NextYearIntention = (typeof NEXT_YEAR_INTENTIONS)[number];

/**
 * Where a student starts in a rollover the office has not drafted: the
 * outcome already recorded, else leaving when the family said the child
 * leaves, else promoted. The office still decides each.
 */
export function firstOutcome(
  saved: string | null,
  intention: NextYearIntention | null,
): NextYearOutcome {
  if (saved === "retain" || saved === "leave" || saved === "graduate")
    return saved;
  return saved === null && intention === "leaving" ? "leave" : "promote";
}

export const openReenrolmentSchema = v.object({ yearId: id });

export const setIntentionSchema = v.object({
  studentId: id,
  intention: v.picklist(NEXT_YEAR_INTENTIONS),
});

/**
 * A class of the target year, proposed from a class of the source year:
 * carried by the module that keeps classes like it (a homeroom with its
 * subject classes), or as a class of its own when `carrier` is empty.
 */
export const rolloverClassSchema = v.object({
  key: id,
  sourceClassId: id,
  carrier: v.optional(v.pipe(v.string(), v.regex(/^[a-z_]{0,20}$/)), ""),
  include: v.boolean(),
  /** A class of its own takes its staying students with it. */
  students: v.optional(v.boolean(), false),
  code: v.pipe(
    v.string(),
    v.trim(),
    v.regex(/^[A-Za-z0-9_.-]{1,40}$/, "validation.class_code"),
  ),
  titleEn: title,
  titleAr: title,
  gradeId: optionalId,
  locationId: optionalId,
  teacherId: optionalId,
  subjects: v.pipe(
    v.array(v.object({ subjectId: id, teacherId: optionalId })),
    v.maxLength(30),
  ),
});
export type RolloverClass = v.InferOutput<typeof rolloverClassSchema>;

/**
 * What happens to one student: the outcome, and for one who stays, the
 * class a carrier places them in, if any.
 */
export const rolloverStudentSchema = v.object({
  studentId: id,
  outcome: v.picklist(NEXT_YEAR_OUTCOMES),
  targetKey: optionalId,
});
export type RolloverStudent = v.InferOutput<typeof rolloverStudentSchema>;

export const rolloverPlanSchema = v.object({
  classes: v.pipe(v.array(rolloverClassSchema), v.maxLength(200)),
  students: v.pipe(v.array(rolloverStudentSchema), v.maxLength(5000)),
});
export type RolloverPlan = v.InferOutput<typeof rolloverPlanSchema>;

export const rolloverQuerySchema = v.object({
  sourceYearId: id,
  targetYearId: id,
});
export type RolloverQuery = v.InferOutput<typeof rolloverQuerySchema>;

export const saveRolloverSchema = v.object({
  ...rolloverQuerySchema.entries,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
  plan: rolloverPlanSchema,
});
export type SaveRolloverInput = v.InferOutput<typeof saveRolloverSchema>;

export const applyRolloverSchema = v.object({
  ...rolloverQuerySchema.entries,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
export type ApplyRolloverInput = v.InferOutput<typeof applyRolloverSchema>;

const staying = (outcome: NextYearOutcome) =>
  outcome === "promote" || outcome === "retain";

/**
 * Whether a student of a class carried as itself joins it in the new year:
 * all but those leaving or graduating, including a student the year never
 * placed, whom no outcome is decided for.
 */
export const followsClass = (outcome: NextYearOutcome | undefined) =>
  outcome === undefined || staying(outcome);

/**
 * The first thing wrong with a plan, as a message key, or null. A student who
 * stays needs an included target class and one who leaves or graduates needs
 * none, every student appears once, and target codes are unique in the year.
 */
export function rolloverPlanIssue(plan: RolloverPlan): string | null {
  if (new Set(plan.classes.map((row) => row.key)).size !== plan.classes.length)
    return "rollover.duplicate_class";
  const included = new Map(
    plan.classes.filter((row) => row.include).map((row) => [row.key, row]),
  );
  const codes = new Set<string>();
  for (const row of included.values()) {
    const code = row.code.trim().toLocaleLowerCase();
    if (codes.has(code)) return "rollover.duplicate_code";
    codes.add(code);
    if (!row.titleEn.trim() && !row.titleAr.trim())
      return "rollover.class_name";
    const subjects = row.subjects.map((subject) => subject.subjectId);
    if (new Set(subjects).size !== subjects.length)
      return "rollover.duplicate_subject";
  }
  const students = new Set<string>();
  for (const student of plan.students) {
    if (students.has(student.studentId)) return "rollover.duplicate_student";
    students.add(student.studentId);
    if (!student.targetKey) continue;
    if (!staying(student.outcome)) return "rollover.target_for_leaver";
    if (!included.get(student.targetKey)?.carrier)
      return "rollover.missing_target";
  }
  return null;
}

interface RolloverYear {
  startsOn: string;
  endsBefore: string;
  lifecycle: YearLifecycle;
}

/**
 * Why two years cannot be rolled over, or null. Neither may be closed, the
 * source must have started, and the target starts on or after the day the
 * source ends.
 */
export function rolloverYearsIssue(
  source: RolloverYear,
  target: RolloverYear,
  today: string,
): string | null {
  if (source.lifecycle === "closed" || target.lifecycle === "closed")
    return "school_year.closed";
  if (source.startsOn > today) return "rollover.source_not_started";
  if (target.startsOn < source.endsBefore) return "rollover.overlap";
  return null;
}

export interface RolloverOutcome {
  classes: { key: string; classId: string; code: string }[];
  placed: number;
  left: number;
  graduated: number;
}
