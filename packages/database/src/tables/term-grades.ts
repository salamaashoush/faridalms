import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { index, numeric, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
import { assignments } from "./coursework";
import { gradeScaleVersions } from "./grading";
import { users } from "./people";
import { classes } from "./teaching";
import { tenants } from "./tenancy";

/**
 * A student's grade in a class for a term, the period grade the gradebook
 * shows; families see it once it is released. The term's school year is
 * the year the grading period belongs to.
 */
export const periodGrades = core.table.withRLS(
  "period_grades",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
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
      [t.tenantId, t.classId, t.orgId],
      [classes.tenantId, classes.id, classes.orgId],
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

/** The term an assignment counts toward in its class's term grade. */
export const assignmentTerms = core.table.withRLS(
  "assignment_terms",
  {
    ...tenantColumns(),
    assignmentId: uuid("assignment_id").notNull(),
    gradingPeriodId: uuid("grading_period_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("assignment_terms", t.tenantId, t.id),
    ...baseConstraints("assignment_terms", t, tenants),
    fk(
      "assignment_terms",
      [t.tenantId, t.assignmentId],
      [assignments.tenantId, assignments.id],
    ),
    fk(
      "assignment_terms",
      [t.tenantId, t.gradingPeriodId],
      [academicSessions.tenantId, academicSessions.id],
    ),
    uniqueIndex("assignment_terms_assignment_key")
      .on(t.tenantId, t.assignmentId)
      .where(sql`status = 'active'`),
    index("assignment_terms_period_idx")
      .on(t.tenantId, t.gradingPeriodId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
