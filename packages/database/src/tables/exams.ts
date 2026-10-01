import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
import { users } from "./people";
import { orgs, tenants } from "./tenancy";

/**
 * An exam board of the school's own, for exams the platform does not keep
 * sessions for: its own mocks, a national exam, a board not listed.
 */
export const examBoards = core.table.withRLS(
  "exam_boards",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("exam_boards", t.tenantId, t.id),
    ...baseConstraints("exam_boards", t, tenants),
    fk("exam_boards", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("exam_boards", "title_en", sql`char_length(title_en) between 1 and 120`),
    ck("exam_boards", "title_ar", sql`char_length(title_ar) between 1 and 120`),
    ck("exam_boards", "title", sql`num_nonnulls(title_en, title_ar) >= 1`),
    index("exam_boards_org_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * An exam session a school enters coursework for: one of the platform's
 * official sessions, named by its directory id, or one of the school's own
 * boards. An official session with no keep-until date of its own follows
 * the board's, so a date the operators correct reaches every school that
 * kept the default.
 */
export const examSessions = core.table.withRLS(
  "exam_sessions",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    officialSeries: text("official_series"),
    boardId: uuid("board_id"),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    /** The first day of the month the session sits in. */
    sitsIn: date("sits_in", { mode: "string" }).notNull(),
    keepUntil: date("keep_until", { mode: "string" }),
    declarationRequired: boolean("declaration_required")
      .notNull()
      .default(true),
    aiEvidenceRequired: boolean("ai_evidence_required").notNull().default(true),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("exam_sessions", t.tenantId, t.id),
    ...baseConstraints("exam_sessions", t, tenants),
    fk("exam_sessions", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "exam_sessions",
      [t.tenantId, t.boardId],
      [examBoards.tenantId, examBoards.id],
    ),
    ck(
      "exam_sessions",
      "board",
      sql`num_nonnulls(official_series, board_id) = 1`,
    ),
    ck(
      "exam_sessions",
      "official_series",
      sql`official_series ~ '^[a-z0-9][a-z0-9-]{2,62}$'`,
    ),
    ck(
      "exam_sessions",
      "title_en",
      sql`char_length(title_en) between 1 and 120`,
    ),
    ck(
      "exam_sessions",
      "title_ar",
      sql`char_length(title_ar) between 1 and 120`,
    ),
    ck(
      "exam_sessions",
      "title",
      sql`official_series is not null or num_nonnulls(title_en, title_ar) >= 1`,
    ),
    ck("exam_sessions", "sits_in", sql`extract(day from sits_in) = 1`),
    ck(
      "exam_sessions",
      "keep_until",
      sql`(official_series is not null or keep_until is not null) and (keep_until is null or keep_until > sits_in)`,
    ),
    uniqueIndex("exam_sessions_official_key")
      .on(t.tenantId, t.orgId, t.officialSeries)
      .where(sql`status = 'active' and official_series is not null`),
    index("exam_sessions_org_idx")
      .on(t.tenantId, t.orgId, t.sitsIn)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

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
