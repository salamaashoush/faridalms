import * as v from "valibot";

import type { ContentIssue } from "./content-checks";
import type { CheckBlock, LessonDocument } from "./learning";

import { contentDocumentSchema, contentPlainText } from "./content";
import { contentIssues } from "./content-checks";
import { declarationSchema } from "./exams";
import {
  checkBlocks,
  isCheck,
  lessonDocumentSchema,
  MAX_MARKED_TOGETHER,
  MAX_PROGRAM_CHARS,
  responseSchema,
} from "./learning";

export const LATE_POLICIES = ["accept", "deduct", "refuse"] as const;
export type LatePolicy = (typeof LATE_POLICIES)[number];
export const SUBMISSION_FORMATS = [
  "online",
  "files",
  "both",
  "none",
  "quiz",
  "discussion",
] as const;
export type SubmissionFormat = (typeof SUBMISSION_FORMATS)[number];
/** Classmates' posts a discussion can ask each student to answer. */
export const MAX_DISCUSSION_REPLIES = 5;
/**
 * How a discussion runs: whether a student sees classmates' posts only once
 * they have posted their own, as a question-and-answer forum keeps a first
 * answer independent, and how many classmates' posts each should answer.
 */
export const discussionSchema = v.object({
  postFirst: v.boolean(),
  replies: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(MAX_DISCUSSION_REPLIES),
  ),
});
export type DiscussionSettings = v.InferOutput<typeof discussionSchema>;

/** Which attempt's score counts when a quiz may be taken more than once. */
export const QUIZ_KEEPS = ["highest", "latest", "average", "first"] as const;
export type QuizKeep = (typeof QUIZ_KEEPS)[number];
/**
 * What a student sees after handing a quiz in: the right answers and
 * explanations, only which questions were right, or nothing until the
 * teacher returns it.
 */
export const QUIZ_REVEALS = [
  "answers",
  "feedback",
  "marks",
  "returned",
] as const;
export type QuizReveal = (typeof QUIZ_REVEALS)[number];
export const MAX_QUIZ_ATTEMPTS = 10;
/** The longest a timed quiz may run, in minutes, before any extra time. */
export const MAX_QUIZ_MINUTES = 480;
/**
 * How long after a timed attempt ends an answer sent before it still counts,
 * for a slow connection; nothing is kept once it has passed.
 */
export const QUIZ_GRACE_MS = 30_000;
export const AUDIENCES = ["class", "selected"] as const;
export type Audience = (typeof AUDIENCES)[number];

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

export const quizSchema = v.object({
  /** Null lets a student take it as often as they like before it closes. */
  attempts: v.nullable(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(1),
      v.maxValue(MAX_QUIZ_ATTEMPTS),
    ),
  ),
  keep: v.picklist(QUIZ_KEEPS),
  reveal: v.picklist(QUIZ_REVEALS),
  /** Each student meets the questions in their own order. */
  shuffle: v.boolean(),
  /** Minutes an attempt runs from when it begins; null for no limit. */
  timeLimit: v.optional(
    v.nullable(
      v.pipe(
        v.number(),
        v.integer(),
        v.minValue(1),
        v.maxValue(MAX_QUIZ_MINUTES),
      ),
    ),
    null,
  ),
});
export type QuizSettings = v.InferOutput<typeof quizSchema>;

export const reusableSchema = v.object({
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
});

/** An assignment set again in a class, from any class or year its teacher reaches. */
export const reuseSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  classId: v.pipe(v.string(), v.uuid()),
});

export const saveAssignmentSchema = v.object({
  id: v.optional(id),
  expectedVersion: v.optional(version),
  classId: id,
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  brief: contentDocumentSchema,
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
  categoryId: v.optional(v.union([v.literal(""), id]), ""),
  /** Returned work shows its grade only once the student answers every comment. */
  gradeAfterAnswers: v.optional(v.boolean(), false),
  quiz: v.optional(v.nullable(quizSchema), null),
  discussion: v.optional(v.nullable(discussionSchema), null),
});
export type SaveAssignmentInput = v.InferInput<typeof saveAssignmentSchema>;
export type SaveAssignment = v.InferOutput<typeof saveAssignmentSchema>;

export type AssignmentIssue =
  | "coursework.due_before_available"
  | "coursework.close_before_due"
  | "coursework.deduction_required"
  | "coursework.rubric_needs_points"
  | "coursework.audience_empty"
  | "coursework.brief_empty"
  | "coursework.quiz_needed"
  | "coursework.discussion_needed"
  | "coursework.quiz_questions"
  | "coursework.quiz_incomplete"
  | "coursework.quiz_gate"
  | "coursework.quiz_rubric"
  | "coursework.draw_tag"
  | "coursework.draw_short"
  | `content.${ContentIssue}`;

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
  if ((input.submissionFormat === "quiz") !== (input.quiz !== null))
    return "coursework.quiz_needed";
  if ((input.submissionFormat === "discussion") !== (input.discussion !== null))
    return "coursework.discussion_needed";
  if (input.quiz) {
    if (input.rubric) return "coursework.quiz_rubric";
    if (input.brief.root.children?.some((node) => node.type === "gate"))
      return "coursework.quiz_gate";
  }
  return null;
}

/** What stops a quiz's questions going out: none to mark, or one unfinished. */
export function quizIssue(quiz: LessonDocument): AssignmentIssue | null {
  if (quizPoints(quiz) === 0) return "coursework.quiz_questions";
  if (quiz.blocks.some((block) => block.type === "draw" && !block.tag))
    return "coursework.draw_tag";
  if (!v.safeParse(lessonDocumentSchema, quiz).success)
    return "coursework.quiz_incomplete";
  return null;
}

/** What still stops a draft being assigned. Empty means it can go out. */
export function publishIssues(
  input: Pick<
    SaveAssignment,
    "brief" | "audience" | "groupIds" | "studentIds"
  > & { quiz?: LessonDocument | null },
): AssignmentIssue[] {
  const issues: AssignmentIssue[] = [];
  const quiz = input.quiz ? quizIssue(input.quiz) : null;
  if (quiz) issues.push(quiz);
  if (!contentPlainText(input.brief).trim())
    issues.push("coursework.brief_empty");
  for (const code of contentIssues(input.brief)) issues.push(`content.${code}`);
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
});
export type SaveDraftInput = v.InferOutput<typeof saveDraftSchema>;

export const handInSchema = v.object({
  assignmentId: id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
  /** Asked for when the work is assessed coursework for an exam session. */
  declaration: v.optional(declarationSchema),
});

export const assessSchema = v.object({
  attemptId: id,
  score: v.nullable(points),
  rubricScores: v.optional(
    v.nullable(v.record(v.string(), v.pipe(v.string(), v.maxLength(40)))),
    null,
  ),
  rubricComments: v.optional(
    v.nullable(
      v.record(
        v.pipe(v.string(), v.maxLength(40)),
        v.pipe(v.string(), v.trim(), v.maxLength(1000)),
      ),
    ),
    null,
  ),
  feedback: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(10000)), ""),
  privateNote: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000)), ""),
});
export type AssessInput = v.InferOutput<typeof assessSchema>;

/**
 * One end of a comment's passage in handed-in work: the block it falls in
 * and how many characters of the block's own text come before it. Handed-in
 * work never changes, so the place stays true.
 */
const anchorPoint = v.object({
  block: v.pipe(v.string(), v.regex(/^[\da-z]{8,36}$/)),
  offset: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100000)),
});
export const commentAnchorSchema = v.object({
  start: anchorPoint,
  end: anchorPoint,
});
export type CommentAnchor = v.InferOutput<typeof commentAnchorSchema>;

export const MAX_COMMENT_LENGTH = 2000;

/**
 * What a comment asks of the student, so they know how to act on it: a
 * mistake to find and fix, a question to think again about, or a next step.
 */
export const COMMENT_KINDS = ["fix", "think", "next"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

/** A teacher's comment on a passage of one attempt; a new one has no id. */
export const saveCommentSchema = v.object({
  id: v.optional(v.union([v.literal(""), id]), ""),
  attemptId: id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
  anchor: commentAnchorSchema,
  body: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(MAX_COMMENT_LENGTH),
  ),
  /** The bank comment it was picked from, if any. */
  bankId: v.optional(v.union([v.literal(""), id]), ""),
  kind: v.optional(v.picklist(["", ...COMMENT_KINDS]), ""),
  criterionId: v.optional(
    v.pipe(v.string(), v.regex(/^([a-z0-9_-]{1,40})?$/)),
    "",
  ),
});
export type SaveCommentInput = v.InferOutput<typeof saveCommentSchema>;

/** A comment kept in a grader's bank; a new one has no id. */
export const saveBankCommentSchema = v.object({
  id: v.optional(v.union([v.literal(""), id]), ""),
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
  body: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(MAX_COMMENT_LENGTH),
  ),
  /** Every grader at the school may use it, not only its owner. */
  shared: v.boolean(),
});
export type SaveBankCommentInput = v.InferOutput<typeof saveBankCommentSchema>;

export const COMMENT_STATES = ["fixed", "unclear"] as const;
export type CommentState = (typeof COMMENT_STATES)[number];

/** The student's answer to a comment: fixed, not understood, or neither. */
export const answerCommentSchema = v.object({
  commentId: id,
  state: v.picklist(["", ...COMMENT_STATES]),
});

/** A reply under a comment, from the student or a grader. */
export const replyToCommentSchema = v.object({
  commentId: id,
  body: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(MAX_COMMENT_LENGTH),
  ),
});

/** A voice note the grader recorded on an attempt, uploaded as media first. */
export const feedbackRecordingSchema = v.object({ attemptId: id, fileId: id });

export const restoreCommentSchema = v.object({ id });

export const showGradeSchema = v.object({ attemptId: id });

export const removeCommentSchema = v.object({
  id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const STUDENT_WORK_ACTIONS = [
  "return",
  "revise",
  "excuse",
  "unexcuse",
  "hand_in",
  "share",
  "unshare",
] as const;
export type StudentWorkAction = (typeof STUDENT_WORK_ACTIONS)[number];

export const studentWorkActionSchema = v.object({
  assignmentId: id,
  action: v.picklist(STUDENT_WORK_ACTIONS),
  studentIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(500)),
});

/** A due time of their own for some students; empty gives back the assignment's. */
export const extendSchema = v.object({
  assignmentId: id,
  studentIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(500)),
  dueAt: v.union([v.literal(""), v.pipe(v.string(), v.isoTimestamp())]),
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

/** What a quiz is worth: the points of all its questions. */
/** What a quiz is worth: its questions, and each draw's questions at its points. */
export function quizPoints(document: LessonDocument): number {
  return document.blocks.reduce(
    (sum, block) =>
      block.type === "draw"
        ? sum + block.count * block.points
        : isCheck(block)
          ? sum + block.points
          : sum,
    0,
  );
}

/**
 * A quiz as one attempt asks it: each draw stands for the questions drawn
 * for that attempt, in the order they were drawn.
 */
export function attemptQuiz(
  document: LessonDocument,
  drawn: ReadonlyMap<string, readonly CheckBlock[]>,
): LessonDocument {
  if (!document.blocks.some((block) => block.type === "draw")) return document;
  return {
    version: 2,
    blocks: document.blocks.flatMap((block) =>
      block.type === "draw" ? [...(drawn.get(block.id) ?? [])] : [block],
    ),
  };
}

const hundredths = (value: number) => Math.round(value * 100) / 100;

/**
 * One attempt's score: each question's points times the share it earned. A
 * written answer not marked yet counts nothing until it is.
 */
export function attemptScore(
  document: LessonDocument,
  fractions: Record<string, number | null | undefined>,
): number {
  return hundredths(
    checkBlocks(document).reduce(
      (sum: number, block: CheckBlock) =>
        sum + block.points * (fractions[block.id] ?? 0),
      0,
    ),
  );
}

/** The score that counts across a student's attempts, in the order taken. */
export function keptScore(
  scores: readonly number[],
  keep: QuizKeep,
): number | null {
  if (scores.length === 0) return null;
  switch (keep) {
    case "highest":
      return Math.max(...scores);
    case "latest":
      return scores.at(-1) ?? null;
    case "first":
      return scores[0] ?? null;
    case "average":
      return hundredths(
        scores.reduce((sum, score) => sum + score, 0) / scores.length,
      );
  }
  return null;
}

/** When an attempt begun at `startedAt` runs out of its minutes, if it ever does. */
export function sittingEnds(
  startedAt: Date,
  minutes: number | null,
): Date | null {
  return minutes === null
    ? null
    : new Date(startedAt.getTime() + minutes * 60_000);
}

/** Whether an attempt's time has run out, past the grace a slow connection gets. */
export const timeIsUp = (endsAt: Date | null, now: Date) =>
  endsAt !== null && now.getTime() > endsAt.getTime() + QUIZ_GRACE_MS;

/** Whether a student may start or hand in another quiz attempt now. */
export function canTakeQuiz(
  schedule: Schedule,
  attempts: number,
  allowed: number | null,
  now: Date,
): boolean {
  const phase = assignmentPhase(schedule, now);
  if (phase !== "assigned" && phase !== "past_due") return false;
  return allowed === null || attempts < allowed;
}

export const saveQuizAnswerSchema = v.object({
  assignmentId: id,
  blockId: id,
  response: v.nullable(responseSchema),
});

/** A student keeps a program for a quiz's code exercise; the server runs it. */
export const saveQuizProgramSchema = v.object({
  assignmentId: id,
  blockId: id,
  code: v.pipe(v.string(), v.maxLength(MAX_PROGRAM_CHARS)),
});

export const markQuizAnswerSchema = v.object({
  attemptIds: v.pipe(
    v.array(id),
    v.minLength(1),
    v.maxLength(MAX_MARKED_TOGETHER),
  ),
  blockId: id,
  points: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
  feedback: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000)), ""),
});

export const discussionPostSchema = v.object({
  assignmentId: id,
  /** The post answered; a reply to a reply joins the post it hangs under. */
  parentId: v.optional(v.union([v.literal(""), id]), ""),
  content: contentDocumentSchema,
});

export const editDiscussionPostSchema = v.object({
  id,
  content: contentDocumentSchema,
});

export const hideDiscussionPostSchema = v.object({
  id,
  hidden: v.boolean(),
});
