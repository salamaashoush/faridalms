import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { ClassType } from "./teaching";

import { academicSessions } from "./calendar";
import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  erase,
  eraseAndDelete,
  erasureOf,
  fk,
  instant,
  pk,
  redact,
  tenantColumns,
  uq,
} from "./conventions";
import { programmeCategories } from "./exams";
import { gradeScaleVersions } from "./grading";
import { users } from "./people";
import { classes } from "./teaching";
import { tenants } from "./tenancy";

/** A teacher's named set of students in one class, for giving work to some. */
export const classGroups = core.table.withRLS(
  "class_groups",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    classType: text("class_type").$type<ClassType>().notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    createdByUserId: uuid("created_by_user_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("class_groups", t.tenantId, t.id),
    ...baseConstraints("class_groups", t, tenants),
    fk(
      "class_groups",
      [t.tenantId, t.classId, t.classType, t.schoolYearId, t.orgId],
      [
        classes.tenantId,
        classes.id,
        classes.classType,
        classes.schoolYearId,
        classes.orgId,
      ],
    ),
    fk(
      "class_groups",
      [t.tenantId, t.createdByUserId],
      [users.tenantId, users.id],
    ),
    ck("class_groups", "title_en", sql`char_length(title_en) between 1 and 80`),
    ck("class_groups", "title_ar", sql`char_length(title_ar) between 1 and 80`),
    ck("class_groups", "title", sql`num_nonnulls(title_en, title_ar) >= 1`),
    index("class_groups_class_idx")
      .on(t.tenantId, t.classId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export const classGroupMembers = core.table.withRLS(
  "class_group_members",
  {
    ...tenantColumns(),
    groupId: uuid("group_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("class_group_members", t.tenantId, t.id),
    ...baseConstraints("class_group_members", t, tenants),
    fk(
      "class_group_members",
      [t.tenantId, t.groupId],
      [classGroups.tenantId, classGroups.id],
    ),
    fk(
      "class_group_members",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    uniqueIndex("class_group_members_key")
      .on(t.tenantId, t.groupId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export type AssignmentState = "draft" | "published" | "archived";
export type LatePolicy = "accept" | "deduct" | "refuse";
export type SubmissionFormat =
  | "online"
  | "files"
  | "both"
  | "none"
  | "quiz"
  | "discussion";
export type QuizKeep = "highest" | "latest" | "average" | "first";
export type QuizReveal = "answers" | "marks" | "returned";
export type Audience = "class" | "selected";

/**
 * Coursework for one class, and the gradebook line item its results belong
 * to (OneRoster lineItem). Its brief is a document hosted by the assignment;
 * scheduled, past due and closed are read from the dates, not stored.
 */
export const assignments = core.table.withRLS(
  "assignments",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    classType: text("class_type").$type<ClassType>().notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    gradingPeriodId: uuid("grading_period_id"),
    /** Where the work counts in its class programme's term grade. */
    categoryId: uuid("category_id"),
    authorUserId: uuid("author_user_id").notNull(),
    title: text("title").notNull(),
    state: text("state").$type<AssignmentState>().notNull().default("draft"),
    audience: text("audience").$type<Audience>().notNull().default("class"),
    availableFrom: instant("available_from"),
    dueAt: instant("due_at"),
    closesAt: instant("closes_at"),
    latePolicy: text("late_policy")
      .$type<LatePolicy>()
      .notNull()
      .default("accept"),
    lateDeductionPercent: smallint("late_deduction_percent"),
    submissionFormat: text("submission_format")
      .$type<SubmissionFormat>()
      .notNull()
      .default("both"),
    maxFiles: smallint("max_files").notNull().default(5),
    resubmission: boolean("resubmission").notNull().default(false),
    points: numeric("points", { precision: 7, scale: 2, mode: "number" }),
    rubric: jsonb("rubric").$type<Record<string, unknown>>(),
    /** For a quiz: attempts allowed (empty for no limit), which score counts, and what a student sees after each. */
    quizAttempts: smallint("quiz_attempts"),
    quizKeep: text("quiz_keep").$type<QuizKeep>(),
    quizReveal: text("quiz_reveal").$type<QuizReveal>(),
    quizShuffle: boolean("quiz_shuffle").notNull().default(false),
    /** Minutes each attempt runs from when it begins; empty for no limit. */
    quizTimeLimit: smallint("quiz_time_limit"),
    /** Returned work shows its grade only once every comment is answered. */
    gradeAfterAnswers: boolean("grade_after_answers").notNull().default(false),
    /**
     * For a discussion: whether a student sees classmates' posts only once
     * they have posted, and how many classmates' posts each should answer.
     */
    discussionPostFirst: boolean("discussion_post_first"),
    discussionReplies: smallint("discussion_replies"),
    publishedAt: instant("published_at"),
    archivedAt: instant("archived_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("assignments", t.tenantId, t.id),
    ...baseConstraints("assignments", t, tenants),
    fk(
      "assignments",
      [t.tenantId, t.classId, t.classType, t.schoolYearId, t.orgId],
      [
        classes.tenantId,
        classes.id,
        classes.classType,
        classes.schoolYearId,
        classes.orgId,
      ],
    ),
    fk(
      "assignments",
      [t.tenantId, t.gradingPeriodId],
      [academicSessions.tenantId, academicSessions.id],
    ),
    fk("assignments", [t.tenantId, t.authorUserId], [users.tenantId, users.id]),
    ck("assignments", "title", sql`char_length(title) between 1 and 200`),
    ck(
      "assignments",
      "state",
      sql`state in ('draft', 'published', 'archived')`,
    ),
    ck("assignments", "audience", sql`audience in ('class', 'selected')`),
    ck(
      "assignments",
      "quiz_time_limit",
      sql`quiz_time_limit is null or quiz_time_limit between 1 and 480`,
    ),
    ck(
      "assignments",
      "late_policy",
      sql`late_policy in ('accept', 'deduct', 'refuse')`,
    ),
    ck(
      "assignments",
      "late_deduction",
      sql`(late_policy = 'deduct') = (late_deduction_percent is not null) and (late_deduction_percent is null or late_deduction_percent between 1 and 100)`,
    ),
    ck(
      "assignments",
      "submission_format",
      sql`submission_format in ('online', 'files', 'both', 'none', 'quiz', 'discussion')`,
    ),
    ck(
      "assignments",
      "discussion",
      sql`(submission_format = 'discussion') = (discussion_post_first is not null and discussion_replies is not null) and (discussion_replies is null or discussion_replies between 0 and 5)`,
    ),
    ck(
      "assignments",
      "quiz",
      sql`(submission_format = 'quiz') = (quiz_keep is not null and quiz_reveal is not null) and (quiz_attempts is null or quiz_attempts between 1 and 10) and (quiz_keep is null or quiz_keep in ('highest', 'latest', 'average', 'first')) and (quiz_reveal is null or quiz_reveal in ('answers', 'marks', 'returned'))`,
    ),
    ck("assignments", "max_files", sql`max_files between 1 and 20`),
    fk(
      "assignments",
      [t.tenantId, t.categoryId],
      [programmeCategories.tenantId, programmeCategories.id],
    ),
    ck("assignments", "points", sql`points is null or points > 0`),
    ck(
      "assignments",
      "rubric",
      sql`rubric is null or (jsonb_typeof(rubric) = 'object' and octet_length(rubric::text) <= 65536)`,
    ),
    ck(
      "assignments",
      "dates",
      sql`(available_from is null or due_at is null or due_at >= available_from) and (due_at is null or closes_at is null or closes_at >= due_at) and (available_from is null or closes_at is null or closes_at >= available_from)`,
    ),
    ck(
      "assignments",
      "published",
      sql`state = 'draft' or published_at is not null`,
    ),
    index("assignments_class_idx")
      .on(t.tenantId, t.classId, t.state)
      .where(sql`status = 'active'`),
    index("assignments_year_idx")
      .on(t.tenantId, t.orgId, t.schoolYearId)
      .where(sql`status = 'active'`),
    ...entityProfile({ integration: true }),
  ],
);

export type RecipientSource = "class" | "group" | "student";

/**
 * Who an assignment is for, recorded when it is published, so a student who
 * moves class keeps the work they were given. A due date here extends the
 * assignment's for that student alone.
 */
export const assignmentRecipients = core.table.withRLS(
  "assignment_recipients",
  {
    ...tenantColumns(),
    assignmentId: uuid("assignment_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    source: text("source").$type<RecipientSource>().notNull(),
    groupId: uuid("group_id"),
    dueAt: instant("due_at"),
    /**
     * The student's own due time comes from their access arrangements, and
     * moves as the assignment's does; one a teacher set stands until they
     * change it.
     */
    dueArranged: boolean("due_arranged").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("assignment_recipients", t.tenantId, t.id),
    ...baseConstraints("assignment_recipients", t, tenants),
    fk(
      "assignment_recipients",
      [t.tenantId, t.assignmentId],
      [assignments.tenantId, assignments.id],
    ),
    fk(
      "assignment_recipients",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "assignment_recipients",
      [t.tenantId, t.groupId],
      [classGroups.tenantId, classGroups.id],
    ),
    ck(
      "assignment_recipients",
      "source",
      sql`source in ('class', 'group', 'student')`,
    ),
    ck(
      "assignment_recipients",
      "group",
      sql`(source = 'group') = (group_id is not null)`,
    ),
    ck(
      "assignment_recipients",
      "due_arranged",
      sql`not due_arranged or due_at is not null`,
    ),
    uniqueIndex("assignment_recipients_key")
      .on(t.tenantId, t.assignmentId, t.studentUserId)
      .where(sql`status = 'active'`),
    index("assignment_recipients_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export type SubmissionState = "draft" | "submitted" | "returned";

/**
 * One student's work on one assignment. The draft is a document hosted by
 * the submission; handing in freezes a copy into an attempt, so an earlier
 * attempt never changes, and the current attempt is the latest.
 */
export const submissions = core.table.withRLS(
  "submissions",
  {
    ...tenantColumns(),
    assignmentId: uuid("assignment_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    state: text("state").$type<SubmissionState>().notNull().default("draft"),
    excused: boolean("excused").notNull().default(false),
    needsRevision: boolean("needs_revision").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("submissions", t.tenantId, t.id),
    uq("submissions", t.tenantId, t.id, t.studentUserId),
    ...baseConstraints("submissions", t, tenants),
    fk(
      "submissions",
      [t.tenantId, t.assignmentId],
      [assignments.tenantId, assignments.id],
    ),
    fk(
      "submissions",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "submissions",
      "state",
      sql`state in ('draft', 'submitted', 'returned')`,
    ),
    uniqueIndex("submissions_key")
      .on(t.tenantId, t.assignmentId, t.studentUserId)
      .where(sql`status = 'active'`),
    index("submissions_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export const submissionAttempts = core.table.withRLS(
  "submission_attempts",
  {
    ...tenantColumns(),
    submissionId: uuid("submission_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    number: integer("number").notNull(),
    isLate: boolean("is_late").notNull(),
    submittedAt: instant("submitted_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    submittedByUserId: uuid("submitted_by_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("submission_attempts", t.tenantId, t.id),
    uq("submission_attempts", t.tenantId, t.id, t.submissionId),
    ...baseConstraints("submission_attempts", t, tenants),
    fk(
      "submission_attempts",
      [t.tenantId, t.submissionId, t.studentUserId],
      [submissions.tenantId, submissions.id, submissions.studentUserId],
    ),
    fk(
      "submission_attempts",
      [t.tenantId, t.submittedByUserId],
      [users.tenantId, users.id],
    ),
    ck("submission_attempts", "number", sql`number between 1 and 100`),
    uniqueIndex("submission_attempts_number_key")
      .on(t.tenantId, t.submissionId, t.number)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A piece of handed-in work a teacher has shared with the student's family.
 * Families see only status and returned results otherwise; sharing is a
 * deliberate choice per piece, and can be taken back.
 */
export const familyShares = core.table.withRLS(
  "family_shares",
  {
    ...tenantColumns(),
    attemptId: uuid("attempt_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    sharedByUserId: uuid("shared_by_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("family_shares", t.tenantId, t.id),
    ...baseConstraints("family_shares", t, tenants),
    fk(
      "family_shares",
      [t.tenantId, t.attemptId],
      [submissionAttempts.tenantId, submissionAttempts.id],
    ),
    fk(
      "family_shares",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "family_shares",
      [t.tenantId, t.sharedByUserId],
      [users.tenantId, users.id],
    ),
    uniqueIndex("family_shares_key")
      .on(t.tenantId, t.attemptId)
      .where(sql`status = 'active'`),
    index("family_shares_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * The teacher's judgement of one attempt (OneRoster result): a draft until it
 * is released, which returns the work. The effective score applies the late
 * deduction the assignment set.
 */
export const assessments = core.table.withRLS(
  "assessments",
  {
    ...tenantColumns(),
    attemptId: uuid("attempt_id").notNull(),
    submissionId: uuid("submission_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    score: numeric("score", { precision: 7, scale: 2, mode: "number" }),
    effectiveScore: numeric("effective_score", {
      precision: 7,
      scale: 2,
      mode: "number",
    }),
    rubricScores: jsonb("rubric_scores").$type<Record<string, unknown>>(),
    /** What the grader wrote on each criterion, by criterion id. */
    rubricComments: jsonb("rubric_comments").$type<Record<string, unknown>>(),
    /** The scale bands in force when the score was given; empty without a scale. */
    gradeScaleVersionId: uuid("grade_scale_version_id"),
    feedback: text("feedback"),
    privateNote: text("private_note"),
    /** Empty while a quiz's own marking is all there is. */
    gradedByUserId: uuid("graded_by_user_id"),
    gradedAt: instant("graded_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    releasedAt: instant("released_at"),
    /** Returned with the grade held: the student reads the comments first. */
    commentsReleasedAt: instant("comments_released_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("assessments", t.tenantId, t.id),
    ...baseConstraints("assessments", t, tenants),
    fk(
      "assessments",
      [t.tenantId, t.attemptId, t.submissionId],
      [
        submissionAttempts.tenantId,
        submissionAttempts.id,
        submissionAttempts.submissionId,
      ],
    ),
    fk(
      "assessments",
      [t.tenantId, t.submissionId, t.studentUserId],
      [submissions.tenantId, submissions.id, submissions.studentUserId],
    ),
    fk(
      "assessments",
      [t.tenantId, t.gradedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "assessments",
      [t.tenantId, t.gradeScaleVersionId],
      [gradeScaleVersions.tenantId, gradeScaleVersions.id],
    ),
    ck("assessments", "score", sql`score is null or score >= 0`),
    ck(
      "assessments",
      "effective_score",
      sql`effective_score is null or effective_score >= 0`,
    ),
    ck(
      "assessments",
      "rubric_scores",
      sql`rubric_scores is null or jsonb_typeof(rubric_scores) = 'object'`,
    ),
    ck(
      "assessments",
      "rubric_comments",
      sql`rubric_comments is null or jsonb_typeof(rubric_comments) = 'object'`,
    ),
    ck(
      "assessments",
      "feedback",
      sql`char_length(feedback) between 1 and 10000`,
    ),
    ck(
      "assessments",
      "private_note",
      sql`char_length(private_note) between 1 and 2000`,
    ),
    uniqueIndex("assessments_attempt_key")
      .on(t.tenantId, t.attemptId)
      .where(sql`status = 'active'`),
    ...entityProfile({ integration: true }),
  ],
);

/** A comment a grader keeps to use again, theirs alone or shared with every grader at the school. */
export const bankComments = core.table.withRLS(
  "bank_comments",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    body: text("body").notNull(),
    shared: boolean("shared").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("bank_comments", t.tenantId, t.id),
    ...baseConstraints("bank_comments", t, tenants),
    fk(
      "bank_comments",
      [t.tenantId, t.ownerUserId],
      [users.tenantId, users.id],
    ),
    ck("bank_comments", "body", sql`char_length(body) between 1 and 2000`),
    index("bank_comments_org_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A teacher's comment on a passage of handed-in work, anchored to the frozen
 * attempt rather than written into it. The student sees it once the work is
 * returned; the passage itself is read from the work, never copied here, so
 * erasing the work takes the student's words with it.
 */
export const workComments = core.table.withRLS(
  "work_comments",
  {
    ...tenantColumns(),
    attemptId: uuid("attempt_id").notNull(),
    authorUserId: uuid("author_user_id").notNull(),
    anchor: jsonb("anchor").$type<Record<string, unknown>>().notNull(),
    body: text("body").notNull(),
    /** The bank comment it started from, which ranks the bank by use. */
    bankCommentId: uuid("bank_comment_id"),
    /** What the student should do with it: fix, think again, or take a next step. */
    kind: text("kind").$type<"fix" | "think" | "next">(),
    /** The rubric criterion it is about, by the criterion's id. */
    criterionId: text("criterion_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("work_comments", t.tenantId, t.id),
    ...baseConstraints("work_comments", t, tenants),
    fk(
      "work_comments",
      [t.tenantId, t.attemptId],
      [submissionAttempts.tenantId, submissionAttempts.id],
    ),
    fk(
      "work_comments",
      [t.tenantId, t.authorUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "work_comments",
      [t.tenantId, t.bankCommentId],
      [bankComments.tenantId, bankComments.id],
    ),
    ck("work_comments", "anchor", sql`jsonb_typeof(anchor) = 'object'`),
    ck("work_comments", "body", sql`char_length(body) between 1 and 2000`),
    ck("work_comments", "kind", sql`kind in ('fix', 'think', 'next')`),
    ck(
      "work_comments",
      "criterion_id",
      sql`char_length(criterion_id) between 1 and 40`,
    ),
    index("work_comments_attempt_idx")
      .on(t.tenantId, t.attemptId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * The student's answer to a comment: fixed, or not understood. Kept apart
 * from the comment so answering never clashes with the grader editing it.
 */
export const workCommentAnswers = core.table.withRLS(
  "work_comment_answers",
  {
    ...tenantColumns(),
    commentId: uuid("comment_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    state: text("state").$type<"fixed" | "unclear">().notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("work_comment_answers", t.tenantId, t.id),
    ...baseConstraints("work_comment_answers", t, tenants),
    fk(
      "work_comment_answers",
      [t.tenantId, t.commentId],
      [workComments.tenantId, workComments.id],
    ),
    fk(
      "work_comment_answers",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck("work_comment_answers", "state", sql`state in ('fixed', 'unclear')`),
    uniqueIndex("work_comment_answers_key")
      .on(t.tenantId, t.commentId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/** A reply in the conversation under a comment, from the student or a grader. */
export const workCommentReplies = core.table.withRLS(
  "work_comment_replies",
  {
    ...tenantColumns(),
    commentId: uuid("comment_id").notNull(),
    authorUserId: uuid("author_user_id").notNull(),
    body: text("body").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("work_comment_replies", t.tenantId, t.id),
    ...baseConstraints("work_comment_replies", t, tenants),
    fk(
      "work_comment_replies",
      [t.tenantId, t.commentId],
      [workComments.tenantId, workComments.id],
    ),
    fk(
      "work_comment_replies",
      [t.tenantId, t.authorUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "work_comment_replies",
      "body",
      sql`char_length(body) between 1 and 2000`,
    ),
    index("work_comment_replies_comment_idx")
      .on(t.tenantId, t.commentId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A post in a discussion set as coursework: a student's answer to the
 * prompt, a reply to someone's post, or the teacher joining in. Replies hang
 * one level under the post they answer. A teacher hides a post rather than
 * deleting it, and erasing its author empties it in place, so the replies
 * under it keep their thread.
 */
export const discussionPosts = core.table.withRLS(
  "discussion_posts",
  {
    ...tenantColumns(),
    assignmentId: uuid("assignment_id").notNull(),
    authorUserId: uuid("author_user_id").notNull(),
    parentPostId: uuid("parent_post_id"),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    plainText: text("plain_text").notNull().default(""),
    editedAt: instant("edited_at"),
    hiddenAt: instant("hidden_at"),
    hiddenByUserId: uuid("hidden_by_user_id"),
    redactedAt: instant("redacted_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("discussion_posts", t.tenantId, t.id),
    ...baseConstraints("discussion_posts", t, tenants),
    fk(
      "discussion_posts",
      [t.tenantId, t.assignmentId],
      [assignments.tenantId, assignments.id],
    ),
    fk(
      "discussion_posts",
      [t.tenantId, t.authorUserId],
      [users.tenantId, users.id],
    ),
    fk("discussion_posts", [t.tenantId, t.parentPostId], [t.tenantId, t.id]),
    fk(
      "discussion_posts",
      [t.tenantId, t.hiddenByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "discussion_posts",
      "content",
      sql`jsonb_typeof(content) = 'object' and octet_length(content::text) <= 131072`,
    ),
    ck("discussion_posts", "plain_text", sql`char_length(plain_text) <= 20000`),
    ck(
      "discussion_posts",
      "hidden",
      sql`(hidden_at is null) = (hidden_by_user_id is null)`,
    ),
    ck(
      "discussion_posts",
      "redacted",
      sql`redacted_at is null or (content = '{}' and plain_text = '')`,
    ),
    index("discussion_posts_assignment_idx")
      .on(t.tenantId, t.assignmentId, t.createdAt)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...redact(erasureOf("author_user_id")),
  ],
);

export type QuizAnswerState = "draft" | "marked" | "needs_marking";

/**
 * A student's answer to one quiz question in one attempt. It changes freely
 * while the attempt is open; handing in marks it, and a written answer waits
 * for its teacher's mark.
 */
export const quizAnswers = core.table.withRLS(
  "quiz_answers",
  {
    ...tenantColumns(),
    submissionId: uuid("submission_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    attempt: smallint("attempt").notNull(),
    blockId: uuid("block_id").notNull(),
    response: jsonb("response").$type<Record<string, unknown>>().notNull(),
    /** From 0 to 1 once marked. */
    fraction: numeric("fraction", { precision: 5, scale: 4, mode: "number" }),
    state: text("state").$type<QuizAnswerState>().notNull().default("draft"),
    feedback: text("feedback"),
    markedByUserId: uuid("marked_by_user_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("quiz_answers", t.tenantId, t.id),
    ...baseConstraints("quiz_answers", t, tenants),
    fk(
      "quiz_answers",
      [t.tenantId, t.submissionId, t.studentUserId],
      [submissions.tenantId, submissions.id, submissions.studentUserId],
    ),
    fk(
      "quiz_answers",
      [t.tenantId, t.markedByUserId],
      [users.tenantId, users.id],
    ),
    ck("quiz_answers", "attempt", sql`attempt between 1 and 100`),
    ck(
      "quiz_answers",
      "response",
      sql`jsonb_typeof(response) = 'object' and octet_length(response::text) <= 65536`,
    ),
    ck(
      "quiz_answers",
      "fraction",
      sql`fraction is null or fraction between 0 and 1`,
    ),
    ck(
      "quiz_answers",
      "state",
      sql`state in ('draft', 'marked', 'needs_marking') and (state <> 'draft' or fraction is null)`,
    ),
    ck(
      "quiz_answers",
      "feedback",
      sql`feedback is null or char_length(feedback) between 1 and 2000`,
    ),
    uniqueIndex("quiz_answers_key")
      .on(t.tenantId, t.submissionId, t.attempt, t.blockId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    // An erased student's answers are emptied and stay for their marks.
    ...erase(erasureOf("student_user_id")),
  ],
);

/**
 * When a timed quiz attempt began and when its time runs out, set once as
 * the student begins so a later change to the quiz or the student's extra
 * time never moves a clock already running. It closes when the attempt is
 * handed in, by the student or by the clock.
 */
export const quizSittings = core.table.withRLS(
  "quiz_sittings",
  {
    ...tenantColumns(),
    submissionId: uuid("submission_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    attempt: smallint("attempt").notNull(),
    startedAt: instant("started_at").notNull(),
    /** Empty for a student whose arrangements give them all the time they need. */
    endsAt: instant("ends_at"),
    closedAt: instant("closed_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("quiz_sittings", t.tenantId, t.id),
    ...baseConstraints("quiz_sittings", t, tenants),
    fk(
      "quiz_sittings",
      [t.tenantId, t.submissionId, t.studentUserId],
      [submissions.tenantId, submissions.id, submissions.studentUserId],
    ),
    ck("quiz_sittings", "attempt", sql`attempt between 1 and 100`),
    ck(
      "quiz_sittings",
      "ends_at",
      sql`ends_at is null or ends_at > started_at`,
    ),
    uniqueIndex("quiz_sittings_key")
      .on(t.tenantId, t.submissionId, t.attempt)
      .where(sql`status = 'active'`),
    index("quiz_sittings_open_idx")
      .on(t.tenantId, t.endsAt)
      .where(
        sql`status = 'active' and closed_at is null and ends_at is not null`,
      ),
    ...entityProfile(),
    // When an erased student sat a quiz is only about them, and goes.
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

/**
 * A question drawn from the bank for one quiz attempt, kept as it was asked
 * so the attempt is marked against it whatever later becomes of the bank.
 * Each draw in the quiz holds its questions in the order drawn.
 */
export const quizDraws = core.table.withRLS(
  "quiz_draws",
  {
    ...tenantColumns(),
    submissionId: uuid("submission_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    attempt: smallint("attempt").notNull(),
    drawId: uuid("draw_id").notNull(),
    position: smallint("position").notNull(),
    bankQuestionId: uuid("bank_question_id").notNull(),
    question: jsonb("question").$type<Record<string, unknown>>().notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("quiz_draws", t.tenantId, t.id),
    ...baseConstraints("quiz_draws", t, tenants),
    fk(
      "quiz_draws",
      [t.tenantId, t.submissionId, t.studentUserId],
      [submissions.tenantId, submissions.id, submissions.studentUserId],
    ),
    ck("quiz_draws", "attempt", sql`attempt between 1 and 100`),
    ck("quiz_draws", "position", sql`position between 0 and 19`),
    ck(
      "quiz_draws",
      "question",
      sql`jsonb_typeof(question) = 'object' and octet_length(question::text) <= 262144`,
    ),
    uniqueIndex("quiz_draws_key")
      .on(t.tenantId, t.submissionId, t.attempt, t.drawId, t.position)
      .where(sql`status = 'active'`),
    index("quiz_draws_bank_question_idx")
      .on(t.tenantId, t.bankQuestionId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    // What an erased student drew goes with the answers it was asked for.
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

/** A teacher's rubric kept for reuse; attaching one copies it onto the work. */
export const rubrics = core.table.withRLS(
  "rubrics",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    title: text("title").notNull(),
    criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("rubrics", t.tenantId, t.id),
    ...baseConstraints("rubrics", t, tenants),
    fk("rubrics", [t.tenantId, t.ownerUserId], [users.tenantId, users.id]),
    ck("rubrics", "title", sql`char_length(title) between 1 and 120`),
    ck(
      "rubrics",
      "criteria",
      sql`jsonb_typeof(criteria) = 'object' and octet_length(criteria::text) <= 65536`,
    ),
    index("rubrics_owner_idx")
      .on(t.tenantId, t.ownerUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A student's grade in a class for a term, the period grade the gradebook
 * and report cards show; families see it once it is released.
 */
export const periodGrades = core.table.withRLS(
  "period_grades",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    classType: text("class_type").$type<ClassType>().notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    gradingPeriodId: uuid("grading_period_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    score: numeric("score", { precision: 7, scale: 2, mode: "number" }),
    maxScore: numeric("max_score", { precision: 7, scale: 2, mode: "number" })
      .notNull()
      .default(100),
    comment: text("comment"),
    gradeScaleVersionId: uuid("grade_scale_version_id"),
    recordedByUserId: uuid("recorded_by_user_id").notNull(),
    releasedAt: instant("released_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("period_grades", t.tenantId, t.id),
    ...baseConstraints("period_grades", t, tenants),
    fk(
      "period_grades",
      [t.tenantId, t.classId, t.classType, t.schoolYearId, t.orgId],
      [
        classes.tenantId,
        classes.id,
        classes.classType,
        classes.schoolYearId,
        classes.orgId,
      ],
    ),
    fk(
      "period_grades",
      [t.tenantId, t.gradingPeriodId],
      [academicSessions.tenantId, academicSessions.id],
    ),
    fk(
      "period_grades",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "period_grades",
      [t.tenantId, t.recordedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "period_grades",
      [t.tenantId, t.gradeScaleVersionId],
      [gradeScaleVersions.tenantId, gradeScaleVersions.id],
    ),
    ck("period_grades", "max_score", sql`max_score > 0`),
    ck(
      "period_grades",
      "score",
      sql`score is null or (score >= 0 and score <= max_score)`,
    ),
    ck(
      "period_grades",
      "comment",
      sql`char_length(comment) between 1 and 2000`,
    ),
    uniqueIndex("period_grades_key")
      .on(t.tenantId, t.classId, t.gradingPeriodId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile({ integration: true }),
  ],
);
