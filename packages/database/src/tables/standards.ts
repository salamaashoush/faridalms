import type { GoalLevel } from "@faridalms/domain/standards";
import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  smallint,
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
  eraseAndDelete,
  erasureOf,
  fk,
  instant,
  pk,
  tenantColumns,
  uq,
} from "./conventions";
import { users } from "./people";
import { classes } from "./teaching";
import { orgs, tenants } from "./tenancy";

/**
 * A set of standards a school teaches to: a curriculum framework, Common
 * Core, or the school's own. One added from a ready-made framework keeps
 * that framework's identifier, so adding it again brings the school's copy
 * back to it rather than making a second.
 */
export const standardFrameworks = core.table.withRLS(
  "standard_frameworks",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    sourceIdentifier: uuid("source_identifier"),
    /**
     * Its items are what work is assessed against; false for ideas that frame
     * units rather than being assessed, such as key concepts or global
     * contexts, which a plan names without asking for questions on them.
     */
    assessed: boolean("assessed").notNull().default(true),
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
    uniqueIndex("standard_frameworks_source_key")
      .on(t.tenantId, t.orgId, t.sourceIdentifier)
      .where(sql`status = 'active' and source_identifier is not null`),
    index("standard_frameworks_org_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * One statement of a framework, under another or at its top, with the code
 * its publisher gives it and what the framework calls its level. The
 * statement is the framework's own words; `statement_ar` is the school's
 * Arabic wording of them, which adding a ready-made framework again keeps.
 */
export const standards = core.table.withRLS(
  "standards",
  {
    ...tenantColumns(),
    frameworkId: uuid("framework_id").notNull(),
    parentId: uuid("parent_id"),
    code: text("code").notNull().default(""),
    statement: text("statement").notNull(),
    statementAr: text("statement_ar"),
    itemType: text("item_type").notNull().default(""),
    position: integer("position").notNull(),
    sourceIdentifier: uuid("source_identifier"),
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
    ck(
      "standards",
      "statement_ar",
      sql`char_length(statement_ar) between 1 and 2000`,
    ),
    ck("standards", "item_type", sql`char_length(item_type) <= 60`),
    ck("standards", "position", sql`position >= 0`),
    ck("standards", "parent", sql`parent_id is distinct from id`),
    uniqueIndex("standards_source_key")
      .on(t.tenantId, t.frameworkId, t.sourceIdentifier)
      .where(sql`status = 'active' and source_identifier is not null`),
    index("standards_framework_idx")
      .on(t.tenantId, t.frameworkId, t.parentId, t.position)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export type EvidenceSource = "lesson" | "quiz" | "rubric";
export type SittingKind = "lesson" | "work";

/**
 * One piece of work a student's evidence and judgements come from: a
 * lesson they took, or work they handed in. Where it came from is kept by
 * the module the work belongs to, in a table of its own.
 */
export const standardSittings = core.table.withRLS(
  "standard_sittings",
  {
    ...tenantColumns(),
    studentUserId: uuid("student_user_id").notNull(),
    kind: text("kind").$type<SittingKind>().notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("standard_sittings", t.tenantId, t.id),
    uq("standard_sittings", t.tenantId, t.id, t.studentUserId),
    uq("standard_sittings", t.tenantId, t.id, t.studentUserId, t.kind),
    ...baseConstraints("standard_sittings", t, tenants),
    fk(
      "standard_sittings",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck("standard_sittings", "kind", sql`kind in ('lesson', 'work')`),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

/**
 * A marked answer to a question tagged with a standard, or a rubric level
 * awarded on a criterion carrying one: what a student's mastery of it is
 * worked out from. One row per standard the question or criterion carried
 * when it was marked, kept by the sitting and question it answers, so
 * marking again changes the row rather than adding one. A lesson's answer
 * sits on a lesson's sitting, a quiz's or rubric's on handed-in work's.
 */
export const standardEvidence = core.table.withRLS(
  "standard_evidence",
  {
    ...tenantColumns(),
    studentUserId: uuid("student_user_id").notNull(),
    standardId: uuid("standard_id").notNull(),
    source: text("source").$type<EvidenceSource>().notNull(),
    sittingId: uuid("sitting_id").notNull(),
    sittingKind: text("sitting_kind")
      .$type<SittingKind>()
      .notNull()
      .generatedAlwaysAs(
        sql`case when source = 'lesson' then 'lesson' else 'work' end`,
      ),
    attempt: smallint("attempt").notNull(),
    /** The question, or for a rubric a name-based id of its criterion. */
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
      [t.tenantId, t.sittingId, t.studentUserId, t.sittingKind],
      [
        standardSittings.tenantId,
        standardSittings.id,
        standardSittings.studentUserId,
        standardSittings.kind,
      ],
    ),
    ck(
      "standard_evidence",
      "source",
      sql`source in ('lesson', 'quiz', 'rubric')`,
    ),
    ck("standard_evidence", "attempt", sql`attempt between 1 and 1000`),
    ck("standard_evidence", "fraction", sql`fraction between 0 and 1`),
    uniqueIndex("standard_evidence_key")
      .on(t.tenantId, t.sittingId, t.attempt, t.blockId, t.standardId)
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
 * What a teacher saw a student do against a standard, with no question
 * asked: a discussion, a practical, a performance. It counts toward the
 * student's mastery as one sitting, at the level the teacher judged, in the
 * class it was seen in when there is one.
 */
export const standardObservations = core.table.withRLS(
  "standard_observations",
  {
    ...tenantColumns(),
    studentUserId: uuid("student_user_id").notNull(),
    standardId: uuid("standard_id").notNull(),
    classId: uuid("class_id"),
    level: text("level")
      .$type<"beginning" | "developing" | "secure">()
      .notNull(),
    note: text("note").notNull().default(""),
    observedByUserId: uuid("observed_by_user_id").notNull(),
    observedAt: instant("observed_at").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("standard_observations", t.tenantId, t.id),
    ...baseConstraints("standard_observations", t, tenants),
    fk(
      "standard_observations",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "standard_observations",
      [t.tenantId, t.standardId],
      [standards.tenantId, standards.id],
    ),
    fk(
      "standard_observations",
      [t.tenantId, t.classId],
      [classes.tenantId, classes.id],
    ),
    fk(
      "standard_observations",
      [t.tenantId, t.observedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "standard_observations",
      "level",
      sql`level in ('beginning', 'developing', 'secure')`,
    ),
    ck("standard_observations", "note", sql`char_length(note) <= 500`),
    index("standard_observations_student_idx")
      .on(t.tenantId, t.studentUserId, t.standardId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    // An observation is only ever about the student it was made of.
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

/**
 * A teacher's judgement of where a child stands against an early learning
 * goal, made from what they know of the child, as the EYFS profile asks:
 * best fit, never worked out from what the child did on a screen. One a
 * child and goal, the latest; the sitting and question it was made from,
 * when the teacher made it from an answer.
 */
export const goalJudgements = core.table.withRLS(
  "goal_judgements",
  {
    ...tenantColumns(),
    studentUserId: uuid("student_user_id").notNull(),
    standardId: uuid("standard_id").notNull(),
    level: text("level").$type<GoalLevel>().notNull(),
    note: text("note").notNull().default(""),
    sittingId: uuid("sitting_id"),
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
    // The answer a judgement came from is the same child's.
    fk(
      "goal_judgements",
      [t.tenantId, t.sittingId, t.studentUserId],
      [
        standardSittings.tenantId,
        standardSittings.id,
        standardSittings.studentUserId,
      ],
    ),
    fk(
      "goal_judgements",
      [t.tenantId, t.judgedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "goal_judgements",
      "level",
      sql`level in ('emerging', 'expected', 'exempt')`,
    ),
    ck("goal_judgements", "note", sql`char_length(note) <= 1000`),
    ck(
      "goal_judgements",
      "work",
      sql`(sitting_id is null) = (block_id is null)`,
    ),
    uniqueIndex("goal_judgements_key")
      .on(t.tenantId, t.studentUserId, t.standardId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    // A judgement is only ever about the child it was made of.
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

/**
 * A child's report against one framework's goals, shared with their
 * family by a teacher: while it stands, the family reads where the child
 * stands on each goal, as the judgements are now. Taking it back hides
 * them again.
 */
export const goalReports = core.table.withRLS(
  "goal_reports",
  {
    ...tenantColumns(),
    studentUserId: uuid("student_user_id").notNull(),
    frameworkId: uuid("framework_id").notNull(),
    sharedByUserId: uuid("shared_by_user_id").notNull(),
    sharedAt: instant("shared_at").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("goal_reports", t.tenantId, t.id),
    ...baseConstraints("goal_reports", t, tenants),
    fk(
      "goal_reports",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "goal_reports",
      [t.tenantId, t.frameworkId],
      [standardFrameworks.tenantId, standardFrameworks.id],
    ),
    fk(
      "goal_reports",
      [t.tenantId, t.sharedByUserId],
      [users.tenantId, users.id],
    ),
    uniqueIndex("goal_reports_key")
      .on(t.tenantId, t.studentUserId, t.frameworkId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);
