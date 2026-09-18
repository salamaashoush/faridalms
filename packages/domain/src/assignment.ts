import * as v from "valibot";

import { contentDocumentSchema, contentPlainText } from "./content";

export const ASSIGNMENT_STATUSES = ["draft", "published", "archived"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];
export const ASSIGNMENT_TYPES = [
  "written_assignment",
  "project",
  "reading",
  "quiz",
  "presentation",
] as const;
export const SUBMISSION_FORMATS = [
  "written",
  "files",
  "written_and_files",
] as const;
export type SubmissionFormat = (typeof SUBMISSION_FORMATS)[number];
export const LATE_POLICIES = [
  "not_accepted",
  "accepted",
  "accepted_with_deduction",
] as const;
export type LatePolicy = (typeof LATE_POLICIES)[number];
export const RESUBMISSION_POLICIES = [
  "not_allowed",
  "until_due",
  "until_close",
] as const;
export type ResubmissionPolicy = (typeof RESUBMISSION_POLICIES)[number];
export const RECIPIENT_MODES = ["class", "groups", "students"] as const;
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const id = v.pipe(v.string(), v.uuid());
const instant = v.pipe(v.string(), v.isoTimestamp());
const optionalInstant = v.optional(v.union([v.literal(""), instant]), "");

export const rubricCriterionSchema = v.object({
  id,
  title: v.pipe(v.string(), v.trim(), v.maxLength(255)),
  description: v.optional(v.pipe(v.string(), v.maxLength(2000)), ""),
  maxPoints: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000)),
});
export type RubricCriterion = v.InferOutput<typeof rubricCriterionSchema>;
export const rubricSchema = v.pipe(
  v.array(rubricCriterionSchema),
  v.maxLength(20),
  v.check(
    (rubric) => new Set(rubric.map((row) => row.id)).size === rubric.length,
    "assignment.duplicate_criteria",
  ),
);

export const assignmentRecipientsSchema = v.object({
  mode: v.picklist(RECIPIENT_MODES),
  groupIds: v.optional(v.pipe(v.array(id), v.maxLength(20)), []),
  studentIds: v.optional(v.pipe(v.array(id), v.maxLength(500)), []),
});
export type AssignmentRecipientsInput = v.InferOutput<
  typeof assignmentRecipientsSchema
>;

export const saveAssignmentSchema = v.pipe(
  v.object({
    id,
    expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(0)),
    classId: id,
    subjectId: id,
    type: v.picklist(ASSIGNMENT_TYPES),
    title: v.pipe(v.string(), v.trim(), v.maxLength(255)),
    instructions: contentDocumentSchema,
    resourceFileIds: v.optional(
      v.pipe(v.array(id), v.maxLength(MAX_ATTACHMENTS)),
      [],
    ),
    recipients: assignmentRecipientsSchema,
    availableFrom: optionalInstant,
    dueAt: instant,
    closesAt: optionalInstant,
    latePolicy: v.picklist(LATE_POLICIES),
    lateDeductionPercent: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.maxValue(100),
    ),
    submissionFormat: v.picklist(SUBMISSION_FORMATS),
    maxAttachments: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.maxValue(MAX_ATTACHMENTS),
    ),
    maxAttachmentBytes: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(1024),
      v.maxValue(MAX_ATTACHMENT_BYTES),
    ),
    resubmission: v.picklist(RESUBMISSION_POLICIES),
    maxScore: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000)),
    rubric: v.optional(rubricSchema, []),
  }),
  v.forward(
    v.check(
      (value) =>
        !value.availableFrom ||
        Date.parse(value.availableFrom) < Date.parse(value.dueAt),
      "validation.due_after_available",
    ),
    ["dueAt"],
  ),
  v.forward(
    v.check(
      (value) =>
        !value.closesAt ||
        Date.parse(value.closesAt) >= Date.parse(value.dueAt),
      "validation.close_after_due",
    ),
    ["closesAt"],
  ),
  v.forward(
    v.check(
      (value) =>
        value.latePolicy !== "accepted_with_deduction" ||
        value.lateDeductionPercent > 0,
      "validation.deduction_required",
    ),
    ["lateDeductionPercent"],
  ),
  v.forward(
    v.check(
      (value) =>
        value.submissionFormat === "written" || value.maxAttachments > 0,
      "validation.attachments_required",
    ),
    ["maxAttachments"],
  ),
  v.forward(
    v.check(
      (value) =>
        value.rubric.length === 0 ||
        value.rubric.reduce((sum, row) => sum + row.maxPoints, 0) ===
          value.maxScore,
      "validation.rubric_total",
    ),
    ["rubric"],
  ),
);
export type SaveAssignmentInput = v.InferInput<typeof saveAssignmentSchema>;
export type SaveAssignmentOutput = v.InferOutput<typeof saveAssignmentSchema>;

export const assignmentRevisionSchema = v.object({
  id,
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export type PublishIssue =
  | "title"
  | "instructions"
  | "recipients"
  | "rubric_titles";

/** What still stops a draft from being published. Empty means publishable. */
export function assignmentPublishIssues(
  input: Pick<
    SaveAssignmentOutput,
    "title" | "instructions" | "recipients" | "rubric"
  >,
): PublishIssue[] {
  const issues: PublishIssue[] = [];
  if (input.title.trim().length < 3) issues.push("title");
  if (contentPlainText(input.instructions).trim().length === 0)
    issues.push("instructions");
  if (
    (input.recipients.mode === "groups" &&
      input.recipients.groupIds.length === 0) ||
    (input.recipients.mode === "students" &&
      input.recipients.studentIds.length === 0)
  )
    issues.push("recipients");
  if (input.rubric.some((row) => row.title.trim().length === 0))
    issues.push("rubric_titles");
  return issues;
}

export const saveStudentGroupSchema = v.object({
  id: v.optional(id),
  classId: id,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  studentIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(500)),
});
export type SaveStudentGroupInput = v.InferInput<typeof saveStudentGroupSchema>;

export const saveSubmissionDraftSchema = v.object({
  assignmentId: id,
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(0)),
  content: v.nullable(contentDocumentSchema),
  fileIds: v.optional(v.pipe(v.array(id), v.maxLength(MAX_ATTACHMENTS)), []),
});
export type SaveSubmissionDraftInput = v.InferOutput<
  typeof saveSubmissionDraftSchema
>;
export const submitAttemptSchema = v.object({
  assignmentId: id,
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const rubricScoreSchema = v.object({
  criterionId: id,
  points: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1000)),
  comment: v.optional(v.pipe(v.string(), v.maxLength(2000)), ""),
});
export const assessAttemptSchema = v.object({
  attemptId: id,
  score: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1000)),
  rubricScores: v.optional(
    v.pipe(v.array(rubricScoreSchema), v.maxLength(20)),
    [],
  ),
  feedback: v.nullable(contentDocumentSchema),
  release: v.boolean(),
});
export type AssessAttemptInput = v.InferOutput<typeof assessAttemptSchema>;

export type AssignmentWindow = "scheduled" | "open" | "late" | "closed";

export interface AssignmentSchedule {
  availableFrom: string | Date | null;
  dueAt: string | Date;
  closesAt: string | Date | null;
  latePolicy: LatePolicy;
}

function millis(value: string | Date): number {
  return typeof value === "string" ? Date.parse(value) : value.getTime();
}

/** Where `now` falls in an assignment's timeline. */
export function assignmentWindow(
  schedule: AssignmentSchedule,
  now: string | Date,
): AssignmentWindow {
  const at = millis(now);
  if (schedule.availableFrom && at < millis(schedule.availableFrom))
    return "scheduled";
  if (at <= millis(schedule.dueAt)) return "open";
  if (schedule.latePolicy === "not_accepted") return "closed";
  if (schedule.closesAt && at > millis(schedule.closesAt)) return "closed";
  return "late";
}

/** Whether a learner may hand work in now, given their attempt history. */
export function canSubmitNow(
  schedule: AssignmentSchedule & { resubmission: ResubmissionPolicy },
  attempts: number,
  now: string | Date,
): boolean {
  const window = assignmentWindow(schedule, now);
  if (window === "scheduled" || window === "closed") return false;
  if (attempts === 0) return true;
  if (schedule.resubmission === "not_allowed") return false;
  if (schedule.resubmission === "until_due") return window === "open";
  return true;
}

/** A late submission keeps its raw score; the deduction is applied separately so both stay visible. */
export function effectiveScore(
  score: number,
  late: boolean,
  policy: { latePolicy: LatePolicy; lateDeductionPercent: number },
): number {
  if (!late || policy.latePolicy !== "accepted_with_deduction") return score;
  return Math.round((score * (100 - policy.lateDeductionPercent)) / 100);
}

export type LearnerState =
  | "scheduled"
  | "not_started"
  | "draft"
  | "submitted"
  | "returned"
  | "missing";

/** The one word a learner or parent needs about where the work stands. */
export function learnerState(input: {
  window: AssignmentWindow;
  hasDraft: boolean;
  attempts: number;
  released: boolean;
}): LearnerState {
  if (input.attempts > 0) return input.released ? "returned" : "submitted";
  if (input.window === "scheduled") return "scheduled";
  if (input.window === "closed") return "missing";
  return input.hasDraft ? "draft" : "not_started";
}

export function rubricTotal(
  rubric: RubricCriterion[],
  scores: { criterionId: string; points: number }[],
): number | null {
  if (rubric.length === 0) return null;
  let total = 0;
  for (const criterion of rubric) {
    const entry = scores.find((row) => row.criterionId === criterion.id);
    if (!entry || entry.points > criterion.maxPoints) return null;
    total += entry.points;
  }
  return total;
}
