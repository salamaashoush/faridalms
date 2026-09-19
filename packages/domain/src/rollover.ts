import * as v from "valibot";

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const text = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));

export const ROLLOVER_DECISIONS = ["promote", "repeat", "withdraw"] as const;
export type RolloverDecision = (typeof ROLLOVER_DECISIONS)[number];

/** One class of the target year, proposed from a class of the source year. */
export const rolloverClassSchema = v.object({
  key: id,
  sourceClassId: id,
  include: v.boolean(),
  name: v.pipe(text(32), v.minLength(1)),
  grade: v.pipe(text(16), v.minLength(1)),
  stage: v.picklist(["early_years", "primary", "middle"]),
  room: v.optional(text(32), ""),
  homeroomTeacherId: optionalId,
  subjects: v.array(v.object({ subjectId: id, teacherId: optionalId })),
});
export type RolloverClass = v.InferOutput<typeof rolloverClassSchema>;

/** Where one student goes: the key of a target class, or nowhere on withdrawal. */
export const rolloverStudentSchema = v.object({
  studentId: id,
  sourceClassId: id,
  decision: v.picklist(ROLLOVER_DECISIONS),
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

export const saveRolloverSchema = v.object({
  ...rolloverQuerySchema.entries,
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(0)),
  plan: rolloverPlanSchema,
});
export type SaveRolloverInput = v.InferOutput<typeof saveRolloverSchema>;

export const applyRolloverSchema = v.object({
  ...rolloverQuerySchema.entries,
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
export type ApplyRolloverInput = v.InferOutput<typeof applyRolloverSchema>;

/**
 * The first thing wrong with a plan, as a message key, or null. A promoted or
 * repeating student needs an included target class, a withdrawn one needs
 * none, every student appears once, and target names are unique in the year.
 */
export function rolloverPlanIssue(plan: RolloverPlan): string | null {
  const included = new Map(
    plan.classes.filter((row) => row.include).map((row) => [row.key, row]),
  );
  if (new Set(plan.classes.map((row) => row.key)).size !== plan.classes.length)
    return "rollover.duplicate_class";
  const names = new Set<string>();
  for (const row of included.values()) {
    const name = row.name.trim().toLocaleLowerCase();
    if (names.has(name)) return "rollover.duplicate_name";
    names.add(name);
    const subjects = row.subjects.map((subject) => subject.subjectId);
    if (new Set(subjects).size !== subjects.length)
      return "rollover.duplicate_subject";
  }
  const students = new Set<string>();
  for (const student of plan.students) {
    if (students.has(student.studentId)) return "rollover.duplicate_student";
    students.add(student.studentId);
    if (student.decision === "withdraw") {
      if (student.targetKey) return "rollover.withdraw_target";
    } else if (!included.has(student.targetKey)) {
      return "rollover.missing_target";
    }
  }
  return null;
}

/** Years must not overlap: the target starts after the source ends. */
export function rolloverYearsIssue(
  source: { startsOn: string; endsOn: string; status: string },
  target: { startsOn: string; status: string },
): string | null {
  if (target.status === "closed" || source.status === "closed")
    return "academic_year.closed";
  if (source.status === "planning") return "rollover.source_planning";
  if (target.startsOn <= source.endsOn) return "rollover.overlap";
  return null;
}

export interface RolloverResult {
  classes: { key: string; classId: string; name: string }[];
  enrolled: number;
  withdrawn: number;
}
