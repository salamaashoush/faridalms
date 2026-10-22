import type { GoalLevel } from "@faridalms/domain/standards";
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
import { classGroups, submissions } from "./coursework";
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
 * until that module is finished, at `prerequisite_score` or better when
 * set, and when sequential its lessons open in order.
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
    /** The mean score, in percent, of the prerequisite's scored lessons a student needs. */
    prerequisiteScore: smallint("prerequisite_score"),
    /** What a student is told after a mixed review of the module, by the share right first time. */
    practiceBands: jsonb("practice_bands")
      .$type<{ id: string; from: number; text: string }[]>()
      .notNull()
      .default([]),
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
    ck(
      "learning_modules",
      "prerequisite_score",
      sql`prerequisite_score is null or (prerequisite_module_id is not null and prerequisite_score between 1 and 100)`,
    ),
    ck(
      "learning_modules",
      "practice_bands",
      sql`jsonb_typeof(practice_bands) = 'array' and jsonb_array_length(practice_bands) <= 6`,
    ),
    index("learning_modules_year_idx")
      .on(t.tenantId, t.orgId, t.schoolYearId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export type ModuleAudience = "class" | "selected";

/**
 * The classes a module is set for, in the order each class sees its modules,
 * and whether each whole class takes it or only its chosen groups and
 * students (`module_audiences`).
 */
export const moduleClasses = core.table.withRLS(
  "module_classes",
  {
    ...tenantColumns(),
    moduleId: uuid("module_id").notNull(),
    classId: uuid("class_id").notNull(),
    position: smallint("position").notNull().default(0),
    audience: text("audience")
      .$type<ModuleAudience>()
      .notNull()
      .default("class"),
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
    ck("module_classes", "audience", sql`audience in ('class', 'selected')`),
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
 * A group or a student of a class a module is set for only in part: those
 * who take it there. A group is read as it stands, so a student joining it
 * later meets the module too.
 */
export const moduleAudiences = core.table.withRLS(
  "module_audiences",
  {
    ...tenantColumns(),
    moduleId: uuid("module_id").notNull(),
    classId: uuid("class_id").notNull(),
    groupId: uuid("group_id"),
    studentUserId: uuid("student_user_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("module_audiences", t.tenantId, t.id),
    ...baseConstraints("module_audiences", t, tenants),
    fk(
      "module_audiences",
      [t.tenantId, t.moduleId],
      [learningModules.tenantId, learningModules.id],
    ),
    fk(
      "module_audiences",
      [t.tenantId, t.classId],
      [classes.tenantId, classes.id],
    ),
    fk(
      "module_audiences",
      [t.tenantId, t.groupId],
      [classGroups.tenantId, classGroups.id],
    ),
    fk(
      "module_audiences",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "module_audiences",
      "member",
      sql`(group_id is null) <> (student_user_id is null)`,
    ),
    uniqueIndex("module_audiences_group_key")
      .on(t.tenantId, t.moduleId, t.classId, t.groupId)
      .where(sql`status = 'active' and group_id is not null`),
    uniqueIndex("module_audiences_student_key")
      .on(t.tenantId, t.moduleId, t.classId, t.studentUserId)
      .where(sql`status = 'active' and student_user_id is not null`),
    ...entityProfile(),
    // A student named for a module goes when they are erased.
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

/**
 * One lesson of a module. Its blocks are the document hosted as `lesson`;
 * `completion` says what finishes it for a student. With a condition it is
 * shown only to the students whose best score in an earlier lesson of the
 * module is at least `condition_at_least`, below `condition_below`, or both.
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
    /** What a student is told on finishing, by their score: `{ id, from, text }` each. */
    bands: jsonb("feedback_bands")
      .$type<{ id: string; from: number; text: string }[]>()
      .notNull()
      .default([]),
    /** Set out for young children: text read aloud on a tap, larger answers. */
    young: boolean("young").notNull().default(false),
    /** A young lesson lights each word as the voice reads it. */
    readAlong: boolean("read_along").notNull().default(true),
    /** Whether students read vowel marks, or choose for themselves. */
    vowelMarks: text("vowel_marks")
      .$type<"shown" | "hidden" | "choice">()
      .notNull()
      .default("shown"),
    /** The language the lesson teaches in; none reads it from the lesson's words. */
    language: text("language").$type<"en" | "ar">(),
    /** The lesson's title in the language of its translation, when it has one. */
    translationTitle: text("translation_title"),
    /**
     * Who checked the translation against the original, when, and a digest
     * of the original's words then, which tells whether it has changed since.
     */
    translationReviewedAt: instant("translation_reviewed_at"),
    translationReviewedByUserId: uuid("translation_reviewed_by_user_id"),
    translationSourceDigest: text("translation_source_digest"),
    conditionLessonId: uuid("condition_lesson_id"),
    conditionAtLeast: smallint("condition_at_least"),
    conditionBelow: smallint("condition_below"),
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
    ck("lessons", "language", sql`language in ('en', 'ar')`),
    ck(
      "lessons",
      "translation_title",
      sql`translation_title is null or (language is not null and char_length(translation_title) between 1 and 200)`,
    ),
    fk(
      "lessons",
      [t.tenantId, t.translationReviewedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "lessons",
      "translation_review",
      sql`(translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null)`,
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
    fk("lessons", [t.tenantId, t.conditionLessonId], [t.tenantId, t.id]),
    ck(
      "lessons",
      "condition",
      sql`case when condition_lesson_id is null
        then condition_at_least is null and condition_below is null
        else condition_lesson_id <> id
          and (condition_at_least is not null or condition_below is not null)
          and coalesce(condition_at_least between 1 and 100, true)
          and coalesce(condition_below between 1 and 100, true)
          and coalesce(condition_at_least < condition_below, true) end`,
    ),
    ck(
      "lessons",
      "feedback_bands",
      sql`jsonb_typeof(feedback_bands) = 'array' and jsonb_array_length(feedback_bands) <= 6`,
    ),
    index("lessons_module_idx")
      .on(t.tenantId, t.moduleId, t.position)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A lesson a teacher leads a class through live, as Nearpod and Pear Deck
 * do: students reach the parts between its continue gates up to `step`,
 * answer nothing while it is `paused`, and the class board shows the
 * answers to the part's questions once `revealed`. One runs at a time for
 * a lesson and class, until it is ended.
 */
export const pacedLessons = core.table.withRLS(
  "paced_lessons",
  {
    ...tenantColumns(),
    lessonId: uuid("lesson_id").notNull(),
    classId: uuid("class_id").notNull(),
    startedByUserId: uuid("started_by_user_id").notNull(),
    startedAt: instant("started_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    step: smallint("step").notNull().default(0),
    paused: boolean("paused").notNull().default(false),
    revealed: boolean("revealed").notNull().default(false),
    endedAt: instant("ended_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("paced_lessons", t.tenantId, t.id),
    ...baseConstraints("paced_lessons", t, tenants),
    fk(
      "paced_lessons",
      [t.tenantId, t.lessonId],
      [lessons.tenantId, lessons.id],
    ),
    fk(
      "paced_lessons",
      [t.tenantId, t.classId],
      [classes.tenantId, classes.id],
    ),
    fk(
      "paced_lessons",
      [t.tenantId, t.startedByUserId],
      [users.tenantId, users.id],
    ),
    ck("paced_lessons", "step", sql`step between 0 and 999`),
    uniqueIndex("paced_lessons_running_key")
      .on(t.tenantId, t.lessonId, t.classId)
      .where(sql`status = 'active' and ended_at is null`),
    ...entityProfile(),
  ],
);

/**
 * A teacher showing a class how it did on the questions of a lesson that
 * wait for them. It holds for every student of the class in the lesson,
 * those who answer later included.
 */
export const lessonReleases = core.table.withRLS(
  "lesson_releases",
  {
    ...tenantColumns(),
    lessonId: uuid("lesson_id").notNull(),
    classId: uuid("class_id").notNull(),
    /** One student of the class shown on their own; empty for the whole class. */
    studentUserId: uuid("student_user_id"),
    releasedByUserId: uuid("released_by_user_id").notNull(),
    releasedAt: instant("released_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lesson_releases", t.tenantId, t.id),
    ...baseConstraints("lesson_releases", t, tenants),
    fk(
      "lesson_releases",
      [t.tenantId, t.lessonId],
      [lessons.tenantId, lessons.id],
    ),
    fk(
      "lesson_releases",
      [t.tenantId, t.classId],
      [classes.tenantId, classes.id],
    ),
    fk(
      "lesson_releases",
      [t.tenantId, t.releasedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "lesson_releases",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    uniqueIndex("lesson_releases_key")
      .on(t.tenantId, t.lessonId, t.classId)
      .where(sql`status = 'active' and student_user_id is null`),
    uniqueIndex("lesson_releases_student_key")
      .on(t.tenantId, t.lessonId, t.classId, t.studentUserId)
      .where(sql`status = 'active' and student_user_id is not null`),
    ...entityProfile(),
  ],
);

/**
 * A code exercise whose tests changed when its lesson was shown again, and
 * whose teacher chose to mark its answers again. Running students' code
 * takes minutes, so a background pass runs each answer against the version
 * named here and keeps the marks that changed; a later change to the same
 * exercise moves the pending row on to the newer version.
 */
export const programRemarks = core.table.withRLS(
  "program_remarks",
  {
    ...tenantColumns(),
    lessonId: uuid("lesson_id").notNull(),
    blockId: uuid("block_id").notNull(),
    documentVersionId: uuid("document_version_id").notNull(),
    requestedByUserId: uuid("requested_by_user_id").notNull(),
    state: text("state")
      .$type<"pending" | "done">()
      .notNull()
      .default("pending"),
    finishedAt: instant("finished_at"),
    /** Answers whose mark the fresh run changed. */
    remarked: integer("remarked"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("program_remarks", t.tenantId, t.id),
    ...baseConstraints("program_remarks", t, tenants),
    fk(
      "program_remarks",
      [t.tenantId, t.lessonId],
      [lessons.tenantId, lessons.id],
    ),
    fk(
      "program_remarks",
      [t.tenantId, t.documentVersionId],
      [documentVersions.tenantId, documentVersions.id],
    ),
    fk(
      "program_remarks",
      [t.tenantId, t.requestedByUserId],
      [users.tenantId, users.id],
    ),
    ck("program_remarks", "state", sql`state in ('pending', 'done')`),
    ck(
      "program_remarks",
      "finished",
      sql`(state = 'done') = (finished_at is not null)`,
    ),
    uniqueIndex("program_remarks_pending_key")
      .on(t.tenantId, t.lessonId, t.blockId)
      .where(sql`status = 'active' and state = 'pending'`),
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
    /** When the student asked how they did on the questions that wait for the end, this attempt. */
    resultsAt: instant("results_at"),
    /** The language the student reads a lesson with a translation in, once they chose. */
    reading: text("reading").$type<"en" | "ar">(),
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
    ck("lesson_progress", "reading", sql`reading in ('en', 'ar')`),
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
    /** An uploaded recording, or else a YouTube or Vimeo video by its key. */
    fileId: uuid("file_id"),
    embed: text("embed"),
    /** Which video, whoever hosts it: what the student's watching is kept by. */
    video: text("video")
      .notNull()
      .generatedAlwaysAs(sql`coalesce(file_id::text, embed)`),
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
    ck(
      "lesson_watches",
      "video",
      sql`(file_id is null) <> (embed is null) and (embed is null or embed ~ '^(youtube:[A-Za-z0-9_-]{11}|vimeo:[0-9]{4,12})$')`,
    ),
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
      .on(t.tenantId, t.lessonId, t.studentUserId, t.video)
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
  | "reviewed"
  /** A hint the student asked for. */
  | "hint"
  /** An earlier answer marked again under a changed key, carrying its new mark. */
  | "remarked";

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
      sql`kind in ('choice', 'poll', 'text', 'math', 'gaps', 'highlight', 'number', 'matching', 'ordering', 'sorting', 'counting', 'tracing', 'spelling', 'hotspot', 'labelling', 'crossword', 'wordsearch', 'written', 'scratch', 'parsons', 'program', 'project', 'puzzle')`,
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
      sql`state in ('answered', 'revealed', 'needs_marking', 'marked', 'reviewed', 'hint', 'remarked')`,
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

/**
 * A question a teacher keeps to ask again: in their own bank, or the
 * school's. Its content is a document holding the one question, so its
 * pictures and recordings belong to it and are copied wherever it is used.
 * The title is the prompt's words and the kind the question's, kept here so
 * the bank can be searched without opening each document.
 */
export const bankQuestions = core.table.withRLS(
  "bank_questions",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    scope: text("scope").$type<"mine" | "school">().notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("bank_questions", t.tenantId, t.id),
    ...baseConstraints("bank_questions", t, tenants),
    fk("bank_questions", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "bank_questions",
      [t.tenantId, t.ownerUserId],
      [users.tenantId, users.id],
    ),
    ck("bank_questions", "scope", sql`scope in ('mine', 'school')`),
    ck("bank_questions", "kind", sql`kind ~ '^[a-z]{2,20}$'`),
    ck("bank_questions", "title", sql`char_length(title) between 1 and 300`),
    ck("bank_questions", "tags", sql`cardinality(tags) <= 8`),
    index("bank_questions_org_idx")
      .on(t.tenantId, t.orgId, t.scope)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A set of standards a school teaches to: an IB subject's objectives, a
 * curriculum framework, Common Core, or the school's own. One imported from
 * CASE keeps the package's identifier, so importing it again updates it.
 */
export const standardFrameworks = core.table.withRLS(
  "standard_frameworks",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    caseIdentifier: uuid("case_identifier"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("standard_frameworks", t.tenantId, t.id),
    ...baseConstraints("standard_frameworks", t, tenants),
    fk("standard_frameworks", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck(
      "standard_frameworks",
      "title",
      sql`char_length(title) between 1 and 200`,
    ),
    ck(
      "standard_frameworks",
      "description",
      sql`char_length(description) <= 2000`,
    ),
    uniqueIndex("standard_frameworks_case_key")
      .on(t.tenantId, t.orgId, t.caseIdentifier)
      .where(sql`status = 'active' and case_identifier is not null`),
    index("standard_frameworks_org_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * One statement of a framework, under another or at its top, with the code
 * its publisher gives it and what the framework calls its level.
 */
export const standards = core.table.withRLS(
  "standards",
  {
    ...tenantColumns(),
    frameworkId: uuid("framework_id").notNull(),
    parentId: uuid("parent_id"),
    code: text("code").notNull().default(""),
    statement: text("statement").notNull(),
    itemType: text("item_type").notNull().default(""),
    position: integer("position").notNull(),
    caseIdentifier: uuid("case_identifier"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("standards", t.tenantId, t.id),
    ...baseConstraints("standards", t, tenants),
    fk(
      "standards",
      [t.tenantId, t.frameworkId],
      [standardFrameworks.tenantId, standardFrameworks.id],
    ),
    fk("standards", [t.tenantId, t.parentId], [t.tenantId, t.id]),
    ck("standards", "code", sql`char_length(code) <= 60`),
    ck(
      "standards",
      "statement",
      sql`char_length(statement) between 1 and 2000`,
    ),
    ck("standards", "item_type", sql`char_length(item_type) <= 60`),
    ck("standards", "position", sql`position >= 0`),
    ck("standards", "parent", sql`parent_id is distinct from id`),
    uniqueIndex("standards_case_key")
      .on(t.tenantId, t.frameworkId, t.caseIdentifier)
      .where(sql`status = 'active' and case_identifier is not null`),
    index("standards_framework_idx")
      .on(t.tenantId, t.frameworkId, t.parentId, t.position)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export type EvidenceSource = "lesson" | "quiz";

/**
 * A marked answer to a question tagged with a standard: what a student's
 * mastery of it is worked out from. One row per standard the question
 * carried when it was marked, kept by the sitting and question it answers,
 * so marking again changes the row rather than adding one.
 */
export const standardEvidence = core.table.withRLS(
  "standard_evidence",
  {
    ...tenantColumns(),
    studentUserId: uuid("student_user_id").notNull(),
    standardId: uuid("standard_id").notNull(),
    source: text("source").$type<EvidenceSource>().notNull(),
    lessonId: uuid("lesson_id"),
    submissionId: uuid("submission_id"),
    /** The lesson or the student's submission, whichever it came from. */
    sitting: uuid("sitting")
      .notNull()
      .generatedAlwaysAs(sql`coalesce(lesson_id, submission_id)`),
    attempt: smallint("attempt").notNull(),
    blockId: uuid("block_id").notNull(),
    fraction: numeric("fraction", {
      precision: 5,
      scale: 4,
      mode: "number",
    }).notNull(),
    answeredAt: instant("answered_at").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("standard_evidence", t.tenantId, t.id),
    ...baseConstraints("standard_evidence", t, tenants),
    fk(
      "standard_evidence",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "standard_evidence",
      [t.tenantId, t.standardId],
      [standards.tenantId, standards.id],
    ),
    fk(
      "standard_evidence",
      [t.tenantId, t.lessonId],
      [lessons.tenantId, lessons.id],
    ),
    fk(
      "standard_evidence",
      [t.tenantId, t.submissionId, t.studentUserId],
      [submissions.tenantId, submissions.id, submissions.studentUserId],
    ),
    ck(
      "standard_evidence",
      "source",
      sql`(source = 'lesson' and lesson_id is not null and submission_id is null) or (source = 'quiz' and submission_id is not null and lesson_id is null)`,
    ),
    ck("standard_evidence", "attempt", sql`attempt between 1 and 1000`),
    ck("standard_evidence", "fraction", sql`fraction between 0 and 1`),
    uniqueIndex("standard_evidence_key")
      .on(
        t.tenantId,
        t.sitting,
        t.studentUserId,
        t.attempt,
        t.blockId,
        t.standardId,
      )
      .where(sql`status = 'active'`),
    index("standard_evidence_student_idx")
      .on(t.tenantId, t.studentUserId, t.standardId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    // Mastery is only ever about the student it was worked out for.
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

/**
 * A teacher's judgement of where a child stands against an early learning
 * goal, made from what they know of the child, as the EYFS profile asks:
 * best fit, never worked out from what the child did on a screen. One a
 * child and goal, the latest; the lesson answer it was made from, when it
 * was made from one.
 */
export const goalJudgements = core.table.withRLS(
  "goal_judgements",
  {
    ...tenantColumns(),
    studentUserId: uuid("student_user_id").notNull(),
    standardId: uuid("standard_id").notNull(),
    level: text("level").$type<GoalLevel>().notNull(),
    note: text("note").notNull().default(""),
    lessonId: uuid("lesson_id"),
    blockId: uuid("block_id"),
    judgedByUserId: uuid("judged_by_user_id").notNull(),
    judgedAt: instant("judged_at").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("goal_judgements", t.tenantId, t.id),
    ...baseConstraints("goal_judgements", t, tenants),
    fk(
      "goal_judgements",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "goal_judgements",
      [t.tenantId, t.standardId],
      [standards.tenantId, standards.id],
    ),
    fk(
      "goal_judgements",
      [t.tenantId, t.lessonId],
      [lessons.tenantId, lessons.id],
    ),
    fk(
      "goal_judgements",
      [t.tenantId, t.judgedByUserId],
      [users.tenantId, users.id],
    ),
    ck("goal_judgements", "level", sql`level in ('emerging', 'expected')`),
    ck("goal_judgements", "note", sql`char_length(note) <= 1000`),
    ck(
      "goal_judgements",
      "work",
      sql`(lesson_id is null) = (block_id is null)`,
    ),
    uniqueIndex("goal_judgements_key")
      .on(t.tenantId, t.studentUserId, t.standardId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    // A judgement is only ever about the child it was made of.
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);
