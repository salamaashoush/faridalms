import * as v from "valibot";

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.union([v.literal(""), id]);
const isoDate = v.pipe(v.string(), v.isoDate());

const label = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(75),
  v.transform((value) => (value === "" ? null : value)),
);

/** The grade a class teaches, chosen on its form; empty for none. */
export const classGradePartSchema = v.object({ gradeId: optionalId });

/** A student's grade from today, chosen on the student form; empty leaves it. */
export const studentGradePartSchema = v.object({ gradeId: optionalId });

/** The grades a list of classes or students is narrowed to. */
export const gradeViewSchema = v.union([
  id,
  v.pipe(v.array(id), v.minLength(1), v.maxLength(30)),
]);

/** The grade levels a programme covers. */
export const programmeLevelsPartSchema = v.object({
  gradeLevelIds: v.pipe(v.array(id), v.maxLength(20)),
});

/** The grade an intake admits into; empty for none. */
export const intakeGradePartSchema = v.object({ gradeId: optionalId });

/** The grade a rollover gives a class it carries; empty for none. */
export const rolloverGradePartSchema = v.object({ gradeId: optionalId });

export const setStudentGradeSchema = v.object({
  studentId: id,
  gradeId: id,
  from: isoDate,
});

export const saveGradeLevelSchema = v.pipe(
  v.object({
    id: v.optional(id),
    code: v.optional(
      v.pipe(v.string(), v.trim(), v.regex(/^[A-Za-z0-9_.-]{1,40}$/)),
    ),
    labelEn: label,
    labelAr: label,
    /** The labels the editor read, so a change made meanwhile is not overwritten. */
    expected: v.optional(
      v.object({ labelEn: v.string(), labelAr: v.string() }),
    ),
  }),
  v.check(
    (value) => Boolean(value.labelEn || value.labelAr),
    "validation.name_required",
  ),
  v.check(
    (value) => Boolean(value.id) !== Boolean(value.code),
    "validation.invalid",
  ),
);

export const orderGradeLevelsSchema = v.object({
  ids: v.pipe(v.array(id), v.minLength(1), v.maxLength(60)),
});

export const retireGradeLevelSchema = v.object({ id });

/** The word a school uses for its grades, each written out in full in every sentence that names them. */
export const GRADE_TERMS = ["grade", "level", "year_group", "stage"] as const;
export type GradeTerm = (typeof GRADE_TERMS)[number];

/** The school's word as its sentences choose: `unset` until it chooses, which reads as it always has. */
export type GradeWording = GradeTerm | "unset";

/** What the school chose, as the module's word on the current user's face says it. */
export function gradeWordingOf(word: string | undefined): GradeWording {
  return GRADE_TERMS.find((term) => term === word) ?? "unset";
}

export const setGradeTermSchema = v.object({
  term: v.picklist(GRADE_TERMS),
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

/** One stretch of a student's grade: from a day, until the day it ends, or open. */
export interface GradeStretch {
  id: string;
  gradeId: string;
  from: string;
  until: string | null;
}

/** What a grade change writes to a student's stretches. */
export type GradeWrites =
  | { kind: "none" }
  | { kind: "regrade"; id: string; gradeId: string }
  | {
      kind: "insert";
      /** The stretch running that day, ended where the new one starts. */
      end: string | null;
      from: string;
      until: string | null;
    };

const holds = (row: GradeStretch, day: string) =>
  row.from <= day && (row.until === null || day < row.until);

/** The stretch a student is in on a day, if any. */
export const gradeOn = (rows: readonly GradeStretch[], day: string) =>
  rows.find((row) => holds(row, day)) ?? null;

/**
 * A student's grade set from a day. The stretch running that day ends there
 * (or takes the grade in place when it starts that day), and the new one
 * runs as far as that stretch did; with none running, as far as the next
 * stretch, so a change already scheduled for later stands.
 */
export function gradeChange(
  rows: readonly GradeStretch[],
  change: { gradeId: string; from: string },
): GradeWrites {
  const running = gradeOn(rows, change.from);
  if (running?.gradeId === change.gradeId) return { kind: "none" };
  if (running && running.from === change.from)
    return { kind: "regrade", id: running.id, gradeId: change.gradeId };
  const next =
    rows
      .filter((row) => row.from > change.from)
      .toSorted((a, b) => a.from.localeCompare(b.from))[0] ?? null;
  return {
    kind: "insert",
    end: running?.id ?? null,
    from: change.from,
    until: running ? running.until : (next?.from ?? null),
  };
}

/** The grade after one in the school's order; the last stays where it is. */
export function nextGrade(
  grades: readonly { id: string }[],
  gradeId: string | null,
): string {
  const index = grades.findIndex((row) => row.id === gradeId);
  return index < 0 ? (gradeId ?? "") : (grades[index + 1]?.id ?? gradeId ?? "");
}
