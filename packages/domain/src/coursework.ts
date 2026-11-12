import * as v from "valibot";

import type { Anchor } from "./anchors";
import type { PublishIssue } from "./content-checks";
import type { CheckBlock, LessonDocument } from "./learning";

import { anchorSchema } from "./anchors";
import { contentDocumentSchema, contentPlainText } from "./content";
import { CONTENT_ISSUE_CODE, publishIssues } from "./content-checks";
import {
  checkBlocks,
  feedbackBandsSchema,
  fluencyMarkSchema,
  isCheck,
  lessonDocumentSchema,
  MAX_MARKED_TOGETHER,
  MAX_PROGRAM_CHARS,
  responseSchema,
} from "./learning";
import { keysetField } from "./paging";
import { MAX_QUESTION_STANDARDS } from "./standards";
import { CONTENT_LOCALES } from "./translations";

export const LATE_POLICIES = ["accept", "deduct", "refuse"] as const;
export type LatePolicy = (typeof LATE_POLICIES)[number];
export const SUBMISSION_FORMATS = [
  "online",
  "files",
  "both",
  "online_and_files",
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
  /** The module it stands in among the lessons, one set for its class; empty for none. */
  moduleId: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.uuid())]),
    "",
  ),
});
export type DiscussionSettings = v.InferOutput<typeof discussionSchema>;

export const MAX_PEER_REVIEWS = 5;
export const MAX_PEER_COMMENT = 2000;
/**
 * The formats whose handed-in work classmates can read and review: written
 * work and files, a quiz's answers its teacher marks, and a discussion's
 * posts.
 */
export const PEER_FORMATS: readonly SubmissionFormat[] = [
  "online",
  "files",
  "both",
  "online_and_files",
  "quiz",
  "discussion",
];

/**
 * How peer review runs: how many classmates' work each student reviews,
 * and whether reviewer and author stay unnamed to each other, as they do
 * by default: anonymous reviewers give more critical feedback, and
 * students value it more (Panadero and Alqassab 2019).
 */
export const peerReviewSchema = v.object({
  reviews: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(MAX_PEER_REVIEWS),
  ),
  anonymous: v.boolean(),
  /** When the reviews are due; reviewers still writing are reminded the day before. */
  dueAt: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.isoTimestamp())]),
    "",
  ),
});
export type PeerReviewSettings = v.InferOutput<typeof peerReviewSchema>;

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

export const MAX_RUBRIC_CRITERIA = 20;
export const MAX_RUBRIC_LEVELS = 10;
export const MAX_LEVEL_DESCRIPTION = 500;

export const rubricLevelSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^[a-z0-9_-]{1,40}$/)),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
  points,
  /** What work at this level looks like, which the student reads with their mark. */
  description: v.optional(
    v.pipe(v.string(), v.trim(), v.maxLength(MAX_LEVEL_DESCRIPTION)),
  ),
});

export const rubricCriterionSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^[a-z0-9_-]{1,40}$/)),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  levels: v.pipe(
    v.array(rubricLevelSchema),
    v.minLength(1),
    v.maxLength(MAX_RUBRIC_LEVELS),
  ),
  /** The school's standards a level awarded here counts toward. */
  standards: v.optional(
    v.pipe(v.array(id), v.maxLength(MAX_QUESTION_STANDARDS)),
  ),
});
export type RubricCriterion = v.InferOutput<typeof rubricCriterionSchema>;

/** Criteria by levels, each level worth points; attached rubrics are copies. */
export const rubricSchema = v.pipe(
  v.object({
    criteria: v.pipe(
      v.array(rubricCriterionSchema),
      v.minLength(1),
      v.maxLength(MAX_RUBRIC_CRITERIA),
    ),
  }),
  v.check(
    (rubric) =>
      new Set(rubric.criteria.map((row) => row.id)).size ===
        rubric.criteria.length &&
      rubric.criteria.every(
        (row) =>
          new Set(row.levels.map((level) => level.id)).size ===
            row.levels.length &&
          new Set(row.standards).size === (row.standards?.length ?? 0),
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

/**
 * What a graded rubric shows of each standard its criteria carry: the level
 * awarded as a share of the criterion's best, as a question's mark is a
 * share of its points. A criterion left unmarked, or worth nothing, shows
 * nothing.
 */
export function rubricEvidence(
  rubric: Rubric,
  scores: Readonly<Record<string, unknown>>,
): { criterionId: string; standards: string[]; fraction: number }[] {
  return rubric.criteria.flatMap((criterion) => {
    const level = criterion.levels.find(
      (row) => row.id === scores[criterion.id],
    );
    const best = Math.max(0, ...criterion.levels.map((row) => row.points));
    return level && best > 0 && criterion.standards?.length
      ? [
          {
            criterionId: criterion.id,
            standards: criterion.standards,
            fraction: Math.min(1, Math.max(0, level.points / best)),
          },
        ]
      : [];
  });
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
  /** Each question is checked as it is answered, with its tries and hints, as in a lesson. */
  practice: v.optional(v.boolean(), false),
  /** What a student is told with each attempt's score, by that score. */
  bands: v.optional(feedbackBandsSchema, []),
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
  peer: v.optional(v.nullable(peerReviewSchema), null),
  /** The language the brief is written in; without it, the one it had stays. */
  language: v.optional(v.nullable(v.picklist(CONTENT_LOCALES))),
  /** The brief in the other language; without it, the translation it had stays. */
  translation: v.optional(
    v.nullable(
      v.object({
        title: v.pipe(v.string(), v.trim(), v.maxLength(200)),
        content: contentDocumentSchema,
      }),
    ),
  ),
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
  | "coursework.peer_format"
  | "coursework.peer_due_early"
  | "coursework.unreviewed"
  | "coursework.quiz_questions"
  | "coursework.quiz_incomplete"
  | "coursework.quiz_gate"
  | "coursework.quiz_rubric"
  | "coursework.draw_tag"
  | "coursework.draw_short"
  | `content.${Exclude<PublishIssue, "unreviewed" | "heading">}`;

const instantOf = (value: string) => (value ? Date.parse(value) : null);

/**
 * What is wrong with an assignment's dates and late rule, or null: the
 * part of its rules a teacher meets while still writing the dates.
 */
export function scheduleIssue(input: {
  availableFrom: string;
  dueAt: string;
  closesAt: string;
  latePolicy: SaveAssignment["latePolicy"];
  lateDeductionPercent?: number | null;
}): AssignmentIssue | null {
  const available = instantOf(input.availableFrom);
  const due = instantOf(input.dueAt);
  const closes = instantOf(input.closesAt);
  if (available !== null && due !== null && due < available)
    return "coursework.due_before_available";
  if (due !== null && closes !== null && closes < due)
    return "coursework.close_before_due";
  const deduction = input.lateDeductionPercent;
  if (
    (input.latePolicy === "deduct") !== (deduction != null) ||
    (deduction != null &&
      !(Number.isInteger(deduction) && deduction >= 1 && deduction <= 100))
  )
    return "coursework.deduction_required";
  return null;
}

/** The first thing that stops an assignment being saved as it is, or null. */
export function assignmentIssue(input: SaveAssignment): AssignmentIssue | null {
  const scheduled = scheduleIssue(input);
  if (scheduled) return scheduled;
  if (input.rubric && input.points === null)
    return "coursework.rubric_needs_points";
  if ((input.submissionFormat === "quiz") !== (input.quiz !== null))
    return "coursework.quiz_needed";
  if ((input.submissionFormat === "discussion") !== (input.discussion !== null))
    return "coursework.discussion_needed";
  if (input.peer && !PEER_FORMATS.includes(input.submissionFormat))
    return "coursework.peer_format";
  // Reviews follow the work they review.
  const reviewsDue = instantOf(input.peer?.dueAt ?? "");
  const workDue = instantOf(input.dueAt);
  if (reviewsDue !== null && workDue !== null && reviewsDue < workDue)
    return "coursework.peer_due_early";
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
export function assignIssues(
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
  const brief = publishIssues(input.brief);
  if (brief.includes("unreviewed")) issues.push("coursework.unreviewed");
  for (const code of brief)
    if (code !== "unreviewed" && code !== "heading")
      issues.push(CONTENT_ISSUE_CODE[code]);
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
  if (schedule.dueAt && at <= millis(schedule.dueAt) + GRACE_MS)
    return "assigned";
  if (schedule.closesAt && at > millis(schedule.closesAt)) return "closed";
  if (!schedule.dueAt) return "assigned";
  if (schedule.latePolicy === "refuse") return "closed";
  return "past_due";
}

/** Whether work handed in at `at` against this due date is late. */
export function isLate(dueAt: string | Date | null, at: Date): boolean {
  return dueAt !== null && at.getTime() > millis(dueAt) + GRACE_MS;
}

export type HandInIssue =
  | "coursework.nothing_to_hand_in"
  | "coursework.written_needed"
  | "coursework.files_needed";

/** What the work lacks for its format to be handed in, or null when it holds it. */
export function handInIssue(
  format: SubmissionFormat,
  work: { written: boolean; files: boolean },
): HandInIssue | null {
  switch (format) {
    case "online":
      return work.written ? null : "coursework.nothing_to_hand_in";
    case "files":
      return work.files ? null : "coursework.nothing_to_hand_in";
    case "both":
      return work.written || work.files
        ? null
        : "coursework.nothing_to_hand_in";
    case "online_and_files":
      if (!work.written && !work.files) return "coursework.nothing_to_hand_in";
      if (!work.written) return "coursework.written_needed";
      return work.files ? null : "coursework.files_needed";
    default:
      return null;
  }
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

const peerComment = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(MAX_PEER_COMMENT),
);

/**
 * A student's review of a classmate's work: a level for each criterion of
 * the rubric, when the work has one, and the two prompts, what works well
 * and what would make it even better, both asked for every time.
 */
export const peerReviewInputSchema = v.object({
  reviewId: id,
  rubricScores: v.optional(
    v.record(
      v.pipe(v.string(), v.maxLength(40)),
      v.pipe(v.string(), v.maxLength(40)),
    ),
    {},
  ),
  strengths: peerComment,
  suggestion: peerComment,
});
export type PeerReviewInput = v.InferOutput<typeof peerReviewInputSchema>;

export const hidePeerReviewSchema = v.object({
  reviewId: id,
  hidden: v.boolean(),
});

/** How helpful an author found a classmate's review of their work. */
export const PEER_HELPFULNESS = ["very", "somewhat", "not"] as const;
export type PeerHelpfulness = (typeof PEER_HELPFULNESS)[number];

export const ratePeerReviewSchema = v.object({
  reviewId: id,
  helpfulness: v.picklist(PEER_HELPFULNESS),
});

/** A reviewer's comment on a passage of the work they review. */
export const peerCommentSchema = v.object({
  reviewId: id,
  anchor: anchorSchema,
  body: peerComment,
});

export const removePeerCommentSchema = v.object({ id });

/**
 * A comment's passage in handed-in work. Handed-in work never changes, so
 * the place stays true.
 */
export const commentAnchorSchema = anchorSchema;
export type CommentAnchor = Anchor;

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

/** A step on one question of a practice quiz: an answer to check, a hint, or the answer shown. */
export const practiseQuizSchema = v.object({
  assignmentId: id,
  blockId: id,
  step: v.variant("kind", [
    v.object({ kind: v.literal("answer"), response: responseSchema }),
    v.object({ kind: v.literal("hint") }),
    v.object({ kind: v.literal("reveal") }),
  ]),
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
  /** For a passage read aloud in one attempt, how it was read. */
  fluency: v.optional(fluencyMarkSchema),
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

/** Someone likes a post, or takes their like back. */
export const likeDiscussionPostSchema = v.object({
  id,
  liked: v.boolean(),
});

export const sharedWorkQuerySchema = v.object({
  studentId: id,
  after: keysetField,
});

export interface CopyStanding {
  /** How many of the files set aside for each student they put their own version in place of. */
  uploaded: number;
  /** When the last of those versions was stored. */
  at: string | null;
}

/**
 * How far a student has made the brief's files their own: for each file set
 * aside as each student's copy, whether a block of their work holds a
 * version uploaded in place of their copy of it. A file is followed back
 * through the copies made of it to the teacher's own.
 */
export function copyStanding(input: {
  starters: readonly string[];
  blocks: readonly { fileId: string; origin: string | null }[];
  lineage: ReadonlyMap<
    string,
    { copiedFrom: string | null; createdAt: string }
  >;
}): CopyStanding {
  const starters = new Set(input.starters);
  const rootOf = (fileId: string | null) => {
    for (let step = 0, at = fileId; at && step < 10; step++) {
      if (starters.has(at)) return at;
      at = input.lineage.get(at)?.copiedFrom ?? null;
    }
    return null;
  };
  const versions = new Map<string, string>();
  for (const block of input.blocks) {
    const source = rootOf(block.origin);
    if (!source || rootOf(block.fileId) === source) continue;
    const at = input.lineage.get(block.fileId)?.createdAt ?? "";
    if (at > (versions.get(source) ?? "")) versions.set(source, at);
  }
  const times = [...versions.values()].filter(Boolean).toSorted();
  return { uploaded: versions.size, at: times.at(-1) ?? null };
}
