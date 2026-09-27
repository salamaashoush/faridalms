import * as v from "valibot";

import { contentDocumentSchema, contentPlainText } from "./content";

export const LATE_POLICIES = ["accept", "deduct", "refuse"] as const;
export type LatePolicy = (typeof LATE_POLICIES)[number];
export const SUBMISSION_FORMATS = ["online", "files", "both", "none"] as const;
export type SubmissionFormat = (typeof SUBMISSION_FORMATS)[number];
export const AUDIENCES = ["class", "selected"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const MAX_RESOURCES = 10;

/**
 * Work handed in within this long after the due time still counts as on
 * time, so a click at the last minute is not marked late.
 */
export const GRACE_MS = 2 * 60 * 1000;

const id = v.pipe(v.string(), v.uuid());
const version = v.pipe(v.number(), v.integer(), v.minValue(1));
const instant = v.optional(
  v.union([v.literal(""), v.pipe(v.string(), v.isoTimestamp())]),
  "",
);
const points = v.pipe(v.number(), v.minValue(0), v.maxValue(10000));

export const rubricLevelSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^[a-z0-9_-]{1,40}$/)),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
  points,
});

export const rubricCriterionSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^[a-z0-9_-]{1,40}$/)),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  levels: v.pipe(v.array(rubricLevelSchema), v.minLength(1), v.maxLength(10)),
});

/** Criteria by levels, each level worth points; attached rubrics are copies. */
export const rubricSchema = v.pipe(
  v.object({
    criteria: v.pipe(
      v.array(rubricCriterionSchema),
      v.minLength(1),
      v.maxLength(20),
    ),
  }),
  v.check(
    (rubric) =>
      new Set(rubric.criteria.map((row) => row.id)).size ===
        rubric.criteria.length &&
      rubric.criteria.every(
        (row) =>
          new Set(row.levels.map((level) => level.id)).size ===
          row.levels.length,
      ),
    "rubric.duplicate_ids",
  ),
);
export type Rubric = v.InferOutput<typeof rubricSchema>;

/** The most a rubric can award: the best level of every criterion. */
export function rubricTotal(rubric: Rubric): number {
  return rubric.criteria.reduce(
    (sum, row) => sum + Math.max(0, ...row.levels.map((level) => level.points)),
    0,
  );
}

export const saveAssignmentSchema = v.object({
  id: v.optional(id),
  expectedVersion: v.optional(version),
  classId: id,
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  brief: contentDocumentSchema,
  resourceFileIds: v.optional(
    v.pipe(v.array(id), v.maxLength(MAX_RESOURCES)),
    [],
  ),
  audience: v.picklist(AUDIENCES),
  groupIds: v.optional(v.pipe(v.array(id), v.maxLength(30)), []),
  studentIds: v.optional(v.pipe(v.array(id), v.maxLength(500)), []),
  availableFrom: instant,
  dueAt: instant,
  closesAt: instant,
  latePolicy: v.picklist(LATE_POLICIES),
  lateDeductionPercent: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
  ),
  submissionFormat: v.picklist(SUBMISSION_FORMATS),
  maxFiles: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
    5,
  ),
  resubmission: v.optional(v.boolean(), false),
  points: v.nullable(v.pipe(points, v.minValue(0.5))),
  rubric: v.nullable(rubricSchema),
  gradingPeriodId: v.optional(v.union([v.literal(""), id]), ""),
});
export type SaveAssignmentInput = v.InferInput<typeof saveAssignmentSchema>;
export type SaveAssignment = v.InferOutput<typeof saveAssignmentSchema>;

export type AssignmentIssue =
  | "coursework.due_before_available"
  | "coursework.close_before_due"
  | "coursework.deduction_required"
  | "coursework.rubric_needs_points"
  | "coursework.audience_empty"
  | "coursework.brief_empty";

const instantOf = (value: string) => (value ? Date.parse(value) : null);

/** The first thing that stops an assignment being saved as it is, or null. */
export function assignmentIssue(input: SaveAssignment): AssignmentIssue | null {
  const available = instantOf(input.availableFrom);
  const due = instantOf(input.dueAt);
  const closes = instantOf(input.closesAt);
  if (available !== null && due !== null && due < available)
    return "coursework.due_before_available";
  if (due !== null && closes !== null && closes < due)
    return "coursework.close_before_due";
  if ((input.latePolicy === "deduct") !== (input.lateDeductionPercent != null))
    return "coursework.deduction_required";
  if (input.rubric && input.points === null)
    return "coursework.rubric_needs_points";
  return null;
}

/** What still stops a draft being assigned. Empty means it can go out. */
export function publishIssues(
  input: Pick<SaveAssignment, "brief" | "audience" | "groupIds" | "studentIds">,
): AssignmentIssue[] {
  const issues: AssignmentIssue[] = [];
  if (!contentPlainText(input.brief).trim())
    issues.push("coursework.brief_empty");
  if (
    input.audience === "selected" &&
    input.groupIds.length === 0 &&
    input.studentIds.length === 0
  )
    issues.push("coursework.audience_empty");
  return issues;
}

export type AssignmentPhase =
  | "draft"
  | "scheduled"
  | "assigned"
  | "past_due"
  | "closed"
  | "archived";

interface Schedule {
  state: "draft" | "published" | "archived";
  availableFrom: string | Date | null;
  dueAt: string | Date | null;
  closesAt: string | Date | null;
  latePolicy: LatePolicy;
}

const millis = (value: string | Date) =>
  typeof value === "string" ? Date.parse(value) : value.getTime();

/** Where an assignment stands for its teacher at `now`. */
export function assignmentPhase(
  schedule: Schedule,
  now: Date,
): AssignmentPhase {
  if (schedule.state !== "published") return schedule.state;
  const at = now.getTime();
  if (schedule.availableFrom && at < millis(schedule.availableFrom))
    return "scheduled";
  if (!schedule.dueAt || at <= millis(schedule.dueAt) + GRACE_MS)
    return "assigned";
  if (
    schedule.latePolicy === "refuse" ||
    (schedule.closesAt && at > millis(schedule.closesAt))
  )
    return "closed";
  return "past_due";
}

/** Whether work handed in at `at` against this due date is late. */
export function isLate(dueAt: string | Date | null, at: Date): boolean {
  return dueAt !== null && at.getTime() > millis(dueAt) + GRACE_MS;
}

/** Whether a student may hand in now, given how many times they already have. */
export function canHandIn(
  schedule: Schedule & { resubmission: boolean },
  attempts: number,
  returned: boolean,
  now: Date,
): boolean {
  const phase = assignmentPhase(schedule, now);
  if (phase !== "assigned" && phase !== "past_due") return false;
  if (attempts === 0) return true;
  return schedule.resubmission && returned;
}

/** A score after the late deduction the assignment sets, never below zero. */
export function effectiveScore(
  score: number | null,
  late: boolean,
  policy: { latePolicy: LatePolicy; lateDeductionPercent: number | null },
): number | null {
  if (score === null) return null;
  if (!late || policy.latePolicy !== "deduct") return score;
  const kept = 1 - (policy.lateDeductionPercent ?? 0) / 100;
  return Math.max(0, Math.round(score * kept * 100) / 100);
}

export type LearnerState =
  | "not_available"
  | "to_do"
  | "in_progress"
  | "handed_in"
  | "handed_in_late"
  | "missing"
  | "needs_revision"
  | "returned"
  | "excused";

/**
 * The one state a student, their family and their teacher read for a piece
 * of work. Missing starts at the due time whatever the late policy; the
 * grace period absorbs the last-minute boundary.
 */
export function learnerState(
  input: {
    availableFrom: string | Date | null;
    dueAt: string | Date | null;
    excused: boolean;
    needsRevision: boolean;
    hasDraft: boolean;
    latestAttempt: { isLate: boolean } | null;
    released: boolean;
  },
  now: Date,
): LearnerState {
  if (input.excused) return "excused";
  if (input.availableFrom && now.getTime() < millis(input.availableFrom))
    return "not_available";
  if (input.needsRevision) return "needs_revision";
  if (input.released) return "returned";
  if (input.latestAttempt)
    return input.latestAttempt.isLate ? "handed_in_late" : "handed_in";
  if (input.dueAt && now.getTime() > millis(input.dueAt) + GRACE_MS)
    return "missing";
  return input.hasDraft ? "in_progress" : "to_do";
}

export const publishSchema = v.object({ id, expectedVersion: version });

export const saveDraftSchema = v.object({
  assignmentId: id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
  content: v.nullable(contentDocumentSchema),
  fileIds: v.optional(v.pipe(v.array(id), v.maxLength(20)), []),
});
export type SaveDraftInput = v.InferOutput<typeof saveDraftSchema>;

export const handInSchema = v.object({
  assignmentId: id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const assessSchema = v.object({
  attemptId: id,
  score: v.nullable(points),
  rubricScores: v.optional(
    v.nullable(v.record(v.string(), v.pipe(v.string(), v.maxLength(40)))),
    null,
  ),
  feedback: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(10000)), ""),
  privateNote: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000)), ""),
});
export type AssessInput = v.InferOutput<typeof assessSchema>;

export const STUDENT_WORK_ACTIONS = [
  "return",
  "revise",
  "excuse",
  "unexcuse",
] as const;
export type StudentWorkAction = (typeof STUDENT_WORK_ACTIONS)[number];

export const studentWorkActionSchema = v.object({
  assignmentId: id,
  action: v.picklist(STUDENT_WORK_ACTIONS),
  studentIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(500)),
});

export const saveGroupSchema = v.object({
  id: v.optional(id),
  classId: id,
  titleEn: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80)), ""),
  titleAr: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80)), ""),
  studentIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(500)),
});

export const saveRubricSchema = v.object({
  id: v.optional(id),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  rubric: rubricSchema,
});

export const TEACHER_TABS = [
  "to_grade",
  "assigned",
  "scheduled",
  "drafts",
  "past",
] as const;
export type TeacherTab = (typeof TEACHER_TABS)[number];

export const teacherListSchema = v.object({
  tab: v.optional(v.picklist(TEACHER_TABS), "assigned"),
  classId: v.optional(v.union([v.literal(""), id]), ""),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
});
export type TeacherListQuery = v.InferOutput<typeof teacherListSchema>;

export const LEARNER_TABS = ["to_do", "missing", "done"] as const;
export type LearnerTab = (typeof LEARNER_TABS)[number];

export const classBookSchema = v.object({
  classId: id,
  periodId: v.optional(v.union([v.literal(""), id]), ""),
});

export const savePeriodGradesSchema = v.object({
  classId: id,
  periodId: id,
  maxScore: v.optional(v.pipe(points, v.minValue(1)), 100),
  grades: v.pipe(
    v.array(
      v.object({
        studentId: id,
        score: v.nullable(points),
        comment: v.optional(
          v.pipe(v.string(), v.trim(), v.maxLength(2000)),
          "",
        ),
      }),
    ),
    v.maxLength(500),
  ),
});

export const releasePeriodSchema = v.object({ classId: id, periodId: id });
