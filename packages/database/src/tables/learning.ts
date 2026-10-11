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

import { academicSessions } from "./calendar";
import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  eraseAndDelete,
  eraseLedger,
  erasureOf,
  fk,
  instant,
  int4multirange,
  ledgerProfile,
  pk,
  redact,
  tenantColumns,
} from "./conventions";
import { documentVersions } from "./documents";
import { files } from "./files";
import { users } from "./people";
import { classes } from "./teaching";
import { orgs, tenants } from "./tenancy";

export type ModuleState = "draft" | "published" | "archived";
export type LessonCompletion =
  | "view"
  | "mark"
  | "quiz"
  | "score"
  | "reflection"
  | "watch";

/**
 * A module of lessons a teacher sets for classes of one school year. It
 * opens to students at `publish_at`; with a prerequisite it stays locked
 * until that module is finished, and when sequential its lessons open in
 * order.
 */
export const learningModules = core.table.withRLS(
  "learning_modules",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    state: text("state").$type<ModuleState>().notNull().default("draft"),
    publishAt: instant("publish_at"),
    sequential: boolean("sequential").notNull().default(true),
    prerequisiteModuleId: uuid("prerequisite_module_id"),
    authorUserId: uuid("author_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("learning_modules", t.tenantId, t.id),
    ...baseConstraints("learning_modules", t, tenants),
    fk("learning_modules", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "learning_modules",
      [t.tenantId, t.schoolYearId],
      [academicSessions.tenantId, academicSessions.id],
    ),
    fk(
      "learning_modules",
      [t.tenantId, t.prerequisiteModuleId],
      [t.tenantId, t.id],
    ),
    fk(
      "learning_modules",
      [t.tenantId, t.authorUserId],
      [users.tenantId, users.id],
    ),
    ck("learning_modules", "title", sql`char_length(title) between 1 and 200`),
    ck("learning_modules", "summary", sql`char_length(summary) <= 1000`),
    ck(
      "learning_modules",
      "state",
      sql`state in ('draft', 'published', 'archived')`,
    ),
    ck(
      "learning_modules",
      "publish_at",
      sql`(state = 'draft') = (publish_at is null)`,
    ),
    ck(
      "learning_modules",
      "prerequisite",
      sql`prerequisite_module_id is null or prerequisite_module_id <> id`,
    ),
    index("learning_modules_year_idx")
      .on(t.tenantId, t.orgId, t.schoolYearId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/** The classes a module is set for, in the order each class sees its modules. */
export const moduleClasses = core.table.withRLS(
  "module_classes",
  {
    ...tenantColumns(),
    moduleId: uuid("module_id").notNull(),
    classId: uuid("class_id").notNull(),
    position: smallint("position").notNull().default(0),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("module_classes", t.tenantId, t.id),
    ...baseConstraints("module_classes", t, tenants),
    fk(
      "module_classes",
      [t.tenantId, t.moduleId],
      [learningModules.tenantId, learningModules.id],
    ),
    fk(
      "module_classes",
      [t.tenantId, t.classId],
      [classes.tenantId, classes.id],
    ),
    ck("module_classes", "position", sql`position between 0 and 999`),
    uniqueIndex("module_classes_key")
      .on(t.tenantId, t.moduleId, t.classId)
      .where(sql`status = 'active'`),
    index("module_classes_class_idx")
      .on(t.tenantId, t.classId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * One lesson of a module. Its blocks are the document hosted as `lesson`;
 * `completion` says what finishes it for a student.
 */
export const lessons = core.table.withRLS(
  "lessons",
  {
    ...tenantColumns(),
    moduleId: uuid("module_id").notNull(),
    position: smallint("position").notNull(),
    title: text("title").notNull(),
    completion: text("completion")
      .$type<LessonCompletion>()
      .notNull()
      .default("view"),
    passScore: smallint("pass_score"),
    /** Questions missed on the first try are asked once more at the end. */
    review: boolean("review").notNull().default(false),
    /** Set out for young children: text read aloud on a tap, larger answers. */
    young: boolean("young").notNull().default(false),
    /** A young lesson lights each word as the voice reads it. */
    readAlong: boolean("read_along").notNull().default(true),
    /** Whether students read vowel marks, or choose for themselves. */
    vowelMarks: text("vowel_marks")
      .$type<"shown" | "hidden" | "choice">()
      .notNull()
      .default("shown"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lessons", t.tenantId, t.id),
    ...baseConstraints("lessons", t, tenants),
    fk(
      "lessons",
      [t.tenantId, t.moduleId],
      [learningModules.tenantId, learningModules.id],
    ),
    ck("lessons", "title", sql`char_length(title) between 1 and 200`),
    ck("lessons", "position", sql`position between 0 and 999`),
    ck(
      "lessons",
      "vowel_marks",
      sql`vowel_marks in ('shown', 'hidden', 'choice')`,
    ),
    ck(
      "lessons",
      "completion",
      sql`completion in ('view', 'mark', 'quiz', 'score', 'reflection', 'watch')`,
    ),
    ck(
      "lessons",
      "pass_score",
      sql`(completion = 'score') = (pass_score is not null) and (pass_score is null or pass_score between 1 and 100)`,
    ),
    index("lessons_module_idx")
      .on(t.tenantId, t.moduleId, t.position)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * Where a student is in a lesson: their score, where they stopped reading,
 * and whether it is done, by their own work or a teacher's override. Their
 * answers are the rows of `lesson_responses`.
 */
export const lessonProgress = core.table.withRLS(
  "lesson_progress",
  {
    ...tenantColumns(),
    lessonId: uuid("lesson_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    startedAt: instant("started_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    completedAt: instant("completed_at"),
    completedBy: text("completed_by").$type<"student" | "teacher">(),
    score: smallint("score"),
    /** The best score of the attempts before this one; the score never drops below it. */
    bestScore: smallint("best_score"),
    /** The attempt the student is on; a fresh try at the whole lesson starts the next. */
    attempts: smallint("attempts").notNull().default(1),
    position: text("position"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lesson_progress", t.tenantId, t.id),
    ...baseConstraints("lesson_progress", t, tenants),
    fk(
      "lesson_progress",
      [t.tenantId, t.lessonId],
      [lessons.tenantId, lessons.id],
    ),
    fk(
      "lesson_progress",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "lesson_progress",
      "completed",
      sql`(completed_at is null) = (completed_by is null)`,
    ),
    ck(
      "lesson_progress",
      "completed_by",
      sql`completed_by is null or completed_by in ('student', 'teacher')`,
    ),
    ck(
      "lesson_progress",
      "score",
      sql`score is null or score between 0 and 100`,
    ),
    ck(
      "lesson_progress",
      "best_score",
      sql`best_score is null or best_score between 0 and 100`,
    ),
    ck("lesson_progress", "attempts", sql`attempts between 1 and 1000`),
    ck(
      "lesson_progress",
      "position",
      sql`position is null or char_length(position) <= 64`,
    ),
    uniqueIndex("lesson_progress_key")
      .on(t.tenantId, t.lessonId, t.studentUserId)
      .where(sql`status = 'active'`),
    index("lesson_progress_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * How much of each recording in a lesson a student has played: the seconds,
 * merged across sittings so skipping ahead never counts, and where they
 * stopped, so it picks up there. One row per student, lesson and file.
 */
export const lessonWatches = core.table.withRLS(
  "lesson_watches",
  {
    ...tenantColumns(),
    lessonId: uuid("lesson_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    fileId: uuid("file_id").notNull(),
    watched: int4multirange("watched")
      .notNull()
      .default(sql`'{}'::int4multirange`),
    // The seconds a student played more than once: where they went back.
    replayed: int4multirange("replayed")
      .notNull()
      .default(sql`'{}'::int4multirange`),
    durationSeconds: integer("duration_seconds").notNull(),
    positionSeconds: integer("position_seconds").notNull().default(0),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lesson_watches", t.tenantId, t.id),
    ...baseConstraints("lesson_watches", t, tenants),
    fk(
      "lesson_watches",
      [t.tenantId, t.lessonId],
      [lessons.tenantId, lessons.id],
    ),
    fk(
      "lesson_watches",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk("lesson_watches", [t.tenantId, t.fileId], [files.tenantId, files.id]),
    ck("lesson_watches", "duration", sql`duration_seconds between 1 and 21600`),
    ck(
      "lesson_watches",
      "position",
      sql`position_seconds between 0 and duration_seconds`,
    ),
    ck(
      "lesson_watches",
      "watched",
      sql`watched <@ int4multirange(int4range(0, duration_seconds))`,
    ),
    uniqueIndex("lesson_watches_key")
      .on(t.tenantId, t.lessonId, t.studentUserId, t.fileId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export type ResponseState =
  | "answered"
  | "revealed"
  | "needs_marking"
  | "marked"
  /** A question missed at first, answered again at the lesson's end. */
  | "reviewed";

/**
 * Every answer a student gives in a lesson, one row per try, never changed.
 * A teacher's mark on a written answer is a further row for the same try, so
 * the history stays whole. Each row names the published version of the
 * lesson it answered, so an edit never slides a question under its answers.
 */
export const lessonResponses = core.table.withRLS(
  "lesson_responses",
  {
    ...tenantColumns(),
    lessonId: uuid("lesson_id").notNull(),
    documentVersionId: uuid("document_version_id"),
    studentUserId: uuid("student_user_id").notNull(),
    blockId: uuid("block_id").notNull(),
    attempt: smallint("attempt").notNull().default(1),
    try: smallint("try").notNull(),
    kind: text("kind").notNull(),
    response: jsonb("response").$type<Record<string, unknown>>().notNull(),
    /** From 0 to 1; empty while a written answer waits for its mark. */
    fraction: numeric("fraction", { precision: 5, scale: 4, mode: "number" }),
    state: text("state").$type<ResponseState>().notNull(),
    feedback: text("feedback"),
    markedByUserId: uuid("marked_by_user_id"),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    /**
     * When an erasure emptied the row of the answer and what was said of
     * it. Its kind, try and mark stay, as the class's figures need them.
     */
    redactedAt: instant("redacted_at"),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lesson_responses", t.tenantId, t.id),
    fk("lesson_responses", [t.tenantId], [tenants.tenantId]),
    fk(
      "lesson_responses",
      [t.tenantId, t.lessonId],
      [lessons.tenantId, lessons.id],
    ),
    fk(
      "lesson_responses",
      [t.tenantId, t.documentVersionId],
      [documentVersions.tenantId, documentVersions.id],
    ),
    fk(
      "lesson_responses",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "lesson_responses",
      [t.tenantId, t.markedByUserId],
      [users.tenantId, users.id],
    ),
    ck("lesson_responses", "attempt", sql`attempt between 1 and 1000`),
    ck("lesson_responses", "try", sql`try between 1 and 1000`),
    ck(
      "lesson_responses",
      "kind",
      sql`kind in ('choice', 'text', 'gaps', 'number', 'matching', 'ordering', 'sorting', 'counting', 'tracing', 'spelling', 'hotspot', 'written', 'scratch', 'parsons', 'program', 'project', 'puzzle')`,
    ),
    ck(
      "lesson_responses",
      "response",
      sql`jsonb_typeof(response) = 'object' and octet_length(response::text) <= 65536`,
    ),
    ck(
      "lesson_responses",
      "fraction",
      sql`fraction is null or fraction between 0 and 1`,
    ),
    ck(
      "lesson_responses",
      "state",
      sql`state in ('answered', 'revealed', 'needs_marking', 'marked', 'reviewed')`,
    ),
    ck(
      "lesson_responses",
      "marked",
      sql`(state = 'marked') = (marked_by_user_id is not null) and (state <> 'needs_marking' or fraction is null)`,
    ),
    ck(
      "lesson_responses",
      "feedback",
      sql`feedback is null or char_length(feedback) between 1 and 2000`,
    ),
    ck(
      "lesson_responses",
      "redacted",
      sql`redacted_at is null or (response = '{}' and feedback is null)`,
    ),
    index("lesson_responses_student_idx").on(
      t.tenantId,
      t.lessonId,
      t.studentUserId,
      t.attempt,
    ),
    ...ledgerProfile(),
    ...redact(erasureOf("student_user_id")),
  ],
);

/** How a program a student ran ended: as it should, raising an error, or stopped. */
export type RunOutcome = "done" | "error" | "timeout" | "output" | "stopped";

/**
 * Every run of a code exercise a student makes in the browser, never changed,
 * so their teacher can replay how the program came about. What it printed is
 * as the browser reported it, kept to show and never to mark: checking an
 * answer runs it again on the server.
 */
export const lessonRuns = core.table.withRLS(
  "lesson_runs",
  {
    ...tenantColumns(),
    lessonId: uuid("lesson_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    blockId: uuid("block_id").notNull(),
    attempt: smallint("attempt").notNull(),
    code: text("code").notNull(),
    input: text("input").notNull().default(""),
    outcome: text("outcome").$type<RunOutcome>().notNull(),
    error: text("error"),
    output: text("output").notNull().default(""),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lesson_runs", t.tenantId, t.id),
    fk("lesson_runs", [t.tenantId], [tenants.tenantId]),
    fk("lesson_runs", [t.tenantId, t.lessonId], [lessons.tenantId, lessons.id]),
    fk(
      "lesson_runs",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck("lesson_runs", "attempt", sql`attempt between 1 and 1000`),
    ck("lesson_runs", "code", sql`char_length(code) <= 20000`),
    ck("lesson_runs", "input", sql`char_length(input) <= 4000`),
    ck("lesson_runs", "output", sql`char_length(output) <= 2000`),
    ck(
      "lesson_runs",
      "error",
      sql`error is null or char_length(error) between 1 and 500`,
    ),
    ck(
      "lesson_runs",
      "outcome",
      sql`outcome in ('done', 'error', 'timeout', 'output', 'stopped')`,
    ),
    index("lesson_runs_student_idx").on(
      t.tenantId,
      t.lessonId,
      t.studentUserId,
      t.blockId,
    ),
    ...ledgerProfile(),
    ...eraseLedger(erasureOf("student_user_id")),
  ],
);

/**
 * A student's own version of a runnable code block in a lesson, as they
 * last left it, so their changes are there when they come back. It notes
 * the teacher's code it began from, so a later edit of the block shows.
 */
export const lessonCode = core.table.withRLS(
  "lesson_code",
  {
    ...tenantColumns(),
    lessonId: uuid("lesson_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    blockId: text("block_id").notNull(),
    code: text("code").notNull(),
    /** A digest of the teacher's code the student's began from. */
    basedOn: text("based_on").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lesson_code", t.tenantId, t.id),
    ...baseConstraints("lesson_code", t, tenants),
    fk("lesson_code", [t.tenantId, t.lessonId], [lessons.tenantId, lessons.id]),
    fk(
      "lesson_code",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck("lesson_code", "block", sql`block_id ~ '^[0-9a-z]{8,36}$'`),
    ck("lesson_code", "code", sql`char_length(code) <= 20000`),
    ck("lesson_code", "based_on", sql`based_on ~ '^[0-9a-f]{64}$'`),
    uniqueIndex("lesson_code_key")
      .on(t.tenantId, t.lessonId, t.studentUserId, t.blockId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

/**
 * A student's project for a question in a lesson as they last left it: the
 * files they are still building, kept as they type. Handing it in copies
 * them into an answer; this stays theirs to carry on with. It notes the
 * teacher's starter it began from, so a later edit of the starter shows.
 */
export const lessonProjects = core.table.withRLS(
  "lesson_projects",
  {
    ...tenantColumns(),
    lessonId: uuid("lesson_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    blockId: uuid("block_id").notNull(),
    files: jsonb("files").$type<{ name: string; code: string }[]>().notNull(),
    /** A digest of the teacher's starter the student's project began from. */
    basedOn: text("based_on").notNull(),
    /** The classmate whose project in the gallery this one was begun again from. */
    remixedFromUserId: uuid("remixed_from_user_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lesson_projects", t.tenantId, t.id),
    ...baseConstraints("lesson_projects", t, tenants),
    fk(
      "lesson_projects",
      [t.tenantId, t.lessonId],
      [lessons.tenantId, lessons.id],
    ),
    fk(
      "lesson_projects",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "lesson_projects",
      [t.tenantId, t.remixedFromUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "lesson_projects",
      "files",
      sql`jsonb_typeof(files) = 'array' and octet_length(files::text) <= 65536`,
    ),
    ck("lesson_projects", "based_on", sql`based_on ~ '^[0-9a-f]{64}$'`),
    uniqueIndex("lesson_projects_key")
      .on(t.tenantId, t.lessonId, t.studentUserId, t.blockId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

export type LessonShareState = "offered" | "shown" | "declined";

/**
 * A project a student offered to their class's gallery for a question: the
 * project as they had handed it in when they offered it, and whether their
 * teacher has shown it to the class. Classmates see only what is shown. A
 * student who takes theirs back leaves a retired row.
 */
export const lessonShares = core.table.withRLS(
  "lesson_shares",
  {
    ...tenantColumns(),
    lessonId: uuid("lesson_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    blockId: uuid("block_id").notNull(),
    response: jsonb("response").$type<Record<string, unknown>>().notNull(),
    state: text("state").$type<LessonShareState>().notNull().default("offered"),
    decidedByUserId: uuid("decided_by_user_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lesson_shares", t.tenantId, t.id),
    ...baseConstraints("lesson_shares", t, tenants),
    fk(
      "lesson_shares",
      [t.tenantId, t.lessonId],
      [lessons.tenantId, lessons.id],
    ),
    fk(
      "lesson_shares",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "lesson_shares",
      [t.tenantId, t.decidedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "lesson_shares",
      "response",
      sql`jsonb_typeof(response) = 'object' and octet_length(response::text) <= 65536`,
    ),
    ck(
      "lesson_shares",
      "state",
      sql`state in ('offered', 'shown', 'declined') and (state = 'offered') = (decided_by_user_id is null)`,
    ),
    uniqueIndex("lesson_shares_key")
      .on(t.tenantId, t.lessonId, t.studentUserId, t.blockId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);
