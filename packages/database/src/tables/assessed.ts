import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { boolean, index, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  fk,
  pk,
  tenantColumns,
} from "./conventions";
import { assignments, submissionAttempts } from "./coursework";
import { examSessions } from "./exams";
import { users } from "./people";
import { tenants } from "./tenancy";

/**
 * An assignment set as assessed coursework for an exam session: its work is
 * declared by students, authenticated by the teacher and kept until the
 * session's date.
 */
export const courseworkAssessments = core.table.withRLS(
  "coursework_assessments",
  {
    ...tenantColumns(),
    assignmentId: uuid("assignment_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    /** The board's name for the component, such as "Paper 4: Coursework". */
    component: text("component"),
    setByUserId: uuid("set_by_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("coursework_assessments", t.tenantId, t.id),
    ...baseConstraints("coursework_assessments", t, tenants),
    fk(
      "coursework_assessments",
      [t.tenantId, t.assignmentId],
      [assignments.tenantId, assignments.id],
    ),
    fk(
      "coursework_assessments",
      [t.tenantId, t.sessionId],
      [examSessions.tenantId, examSessions.id],
    ),
    fk(
      "coursework_assessments",
      [t.tenantId, t.setByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "coursework_assessments",
      "component",
      sql`char_length(component) between 1 and 120`,
    ),
    uniqueIndex("coursework_assessments_assignment_key")
      .on(t.tenantId, t.assignmentId)
      .where(sql`status = 'active'`),
    index("coursework_assessments_session_idx")
      .on(t.tenantId, t.sessionId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export type DeclarationKind = "student" | "paper";

/**
 * A student's declaration that a handed-in attempt is their own work, signed
 * in the app or received on paper and recorded by a teacher. A new attempt
 * needs a new declaration.
 */
export const attemptDeclarations = core.table.withRLS(
  "attempt_declarations",
  {
    ...tenantColumns(),
    attemptId: uuid("attempt_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    kind: text("kind").$type<DeclarationKind>().notNull(),
    /** Which wording was agreed to, so a later rewording keeps the record. */
    statement: text("statement").notNull(),
    /** Empty for a paper declaration, whose answer is on the paper. */
    aiUsed: boolean("ai_used"),
    recordedByUserId: uuid("recorded_by_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("attempt_declarations", t.tenantId, t.id),
    ...baseConstraints("attempt_declarations", t, tenants),
    fk(
      "attempt_declarations",
      [t.tenantId, t.attemptId],
      [submissionAttempts.tenantId, submissionAttempts.id],
    ),
    fk(
      "attempt_declarations",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "attempt_declarations",
      [t.tenantId, t.recordedByUserId],
      [users.tenantId, users.id],
    ),
    ck("attempt_declarations", "kind", sql`kind in ('student', 'paper')`),
    ck(
      "attempt_declarations",
      "statement",
      sql`statement ~ '^[a-z0-9-]{1,40}$'`,
    ),
    ck(
      "attempt_declarations",
      "ai_used",
      sql`(kind = 'student') = (ai_used is not null)`,
    ),
    uniqueIndex("attempt_declarations_attempt_key")
      .on(t.tenantId, t.attemptId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export type AuthenticationOutcome = "confirmed" | "not_confirmed";

/**
 * The teacher's word on an attempt: that it is the student's own work, done
 * under the conditions set, or that they cannot say so and why. Confirmed
 * work is final; work not confirmed cannot be returned with a grade.
 */
export const attemptAuthentications = core.table.withRLS(
  "attempt_authentications",
  {
    ...tenantColumns(),
    attemptId: uuid("attempt_id").notNull(),
    outcome: text("outcome").$type<AuthenticationOutcome>().notNull(),
    note: text("note"),
    teacherUserId: uuid("teacher_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("attempt_authentications", t.tenantId, t.id),
    ...baseConstraints("attempt_authentications", t, tenants),
    fk(
      "attempt_authentications",
      [t.tenantId, t.attemptId],
      [submissionAttempts.tenantId, submissionAttempts.id],
    ),
    fk(
      "attempt_authentications",
      [t.tenantId, t.teacherUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "attempt_authentications",
      "outcome",
      sql`outcome in ('confirmed', 'not_confirmed')`,
    ),
    ck(
      "attempt_authentications",
      "note",
      sql`char_length(note) between 1 and 2000`,
    ),
    ck(
      "attempt_authentications",
      "reason",
      sql`outcome = 'confirmed' or note is not null`,
    ),
    uniqueIndex("attempt_authentications_attempt_key")
      .on(t.tenantId, t.attemptId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
