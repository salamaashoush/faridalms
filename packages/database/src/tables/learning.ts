import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
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
  fk,
  instant,
  pk,
  tenantColumns,
} from "./conventions";
import { users } from "./people";
import { classes } from "./teaching";
import { orgs, tenants } from "./tenancy";

export type ModuleState = "draft" | "published" | "archived";
export type LessonCompletion =
  | "view"
  | "mark"
  | "quiz"
  | "score"
  | "reflection";

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
      "completion",
      sql`completion in ('view', 'mark', 'quiz', 'score', 'reflection')`,
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
 * Where a student is in a lesson: their answers, their score, and whether it
 * is done, by their own work or a teacher's override.
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
    attempts: smallint("attempts").notNull().default(0),
    answers: jsonb("answers")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
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
    ck("lesson_progress", "attempts", sql`attempts between 0 and 1000`),
    ck(
      "lesson_progress",
      "answers",
      sql`jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 65536`,
    ),
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
