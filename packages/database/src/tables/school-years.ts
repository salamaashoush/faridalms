import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { index, jsonb, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academicSessions } from "./calendar";
import {
  baseConstraints,
  ck,
  core,
  daterange,
  entityColumns,
  entityProfile,
  erase,
  erasureOf,
  fk,
  instant,
  pk,
  range,
  tenantColumns,
} from "./conventions";
import { descriptors } from "./descriptors";
import { users } from "./people";
import { importRuns } from "./records";
import { classes } from "./teaching";
import { tenants } from "./tenancy";

export type NextYearOutcome = "promote" | "retain" | "leave" | "graduate";

/**
 * The school year a class belongs to, one at a time. A year's views of its
 * classes read this link; the class's own dates are core's, kept inside the
 * year by the module while it is on.
 */
export const classYears = core.table.withRLS(
  "class_years",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("class_years", t.tenantId, t.id),
    ...baseConstraints("class_years", t, tenants),
    fk(
      "class_years",
      [t.tenantId, t.classId, t.orgId],
      [classes.tenantId, classes.id, classes.orgId],
    ),
    fk(
      "class_years",
      [t.tenantId, t.schoolYearId, t.schoolYearType, t.schoolYearId, t.orgId],
      [
        academicSessions.tenantId,
        academicSessions.id,
        academicSessions.type,
        academicSessions.schoolYearId,
        academicSessions.orgId,
      ],
    ),
    ck(
      "class_years",
      "school_year_type",
      sql`school_year_type = 'school_year'`,
    ),
    uniqueIndex("class_years_class_key")
      .on(t.tenantId, t.classId)
      .where(sql`status = 'active'`),
    index("class_years_year_idx")
      .on(t.tenantId, t.schoolYearId)
      .where(sql`status = 'active'`),
    ...entityProfile({ integration: true }),
  ],
);

export const studentSchoolYears = core.table.withRLS(
  "student_school_years",
  {
    ...tenantColumns(),
    studentUserId: uuid("student_user_id").notNull(),
    orgId: uuid("org_id").notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
    validDuring: daterange("valid_during").notNull(),
    gradeLevelDescriptorId: uuid("grade_level_descriptor_id"),
    gradeLevelNs: text("grade_level_ns")
      .notNull()
      .generatedAlwaysAs(sql`'grade_level'`),
    entryTypeDescriptorId: uuid("entry_type_descriptor_id"),
    entryTypeNs: text("entry_type_ns")
      .notNull()
      .generatedAlwaysAs(sql`'school_entry_type'`),
    exitTypeDescriptorId: uuid("exit_type_descriptor_id"),
    exitTypeNs: text("exit_type_ns")
      .notNull()
      .generatedAlwaysAs(sql`'school_exit_type'`),
    nextYearOutcome: text("next_year_outcome").$type<NextYearOutcome>(),
    /** Whether the family means the student to return next year, as they or the office said. */
    nextYearIntention: text("next_year_intention").$type<
      "returning" | "undecided" | "leaving"
    >(),
    intentionByUserId: uuid("intention_by_user_id"),
    intentionAt: instant("intention_at"),
    /** The school a student came from, as their papers or family say. */
    previousSchool: text("previous_school"),
    /** Where a student who left went on to, as the family told the office. */
    destinationSchool: text("destination_school"),
    source: text("source")
      .$type<
        "manual" | "import" | "sis" | "oneroster" | "rollover" | "admission"
      >()
      .notNull(),
    importRunId: uuid("import_run_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("student_school_years", t.tenantId, t.id),
    ...baseConstraints("student_school_years", t, tenants),
    fk(
      "student_school_years",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "student_school_years",
      [t.tenantId, t.schoolYearId, t.schoolYearType, t.schoolYearId, t.orgId],
      [
        academicSessions.tenantId,
        academicSessions.id,
        academicSessions.type,
        academicSessions.schoolYearId,
        academicSessions.orgId,
      ],
    ),
    fk(
      "student_school_years",
      [t.tenantId, t.gradeLevelDescriptorId, t.gradeLevelNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "student_school_years",
      [t.tenantId, t.entryTypeDescriptorId, t.entryTypeNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "student_school_years",
      [t.tenantId, t.exitTypeDescriptorId, t.exitTypeNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "student_school_years",
      [t.tenantId, t.importRunId],
      [importRuns.tenantId, importRuns.id],
    ),
    fk(
      "student_school_years",
      [t.tenantId, t.intentionByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "student_school_years",
      "school_year_type",
      sql`school_year_type = 'school_year'`,
    ),
    ck(
      "student_school_years",
      "next_year_outcome",
      sql`next_year_outcome in ('promote', 'retain', 'leave', 'graduate')`,
    ),
    ck(
      "student_school_years",
      "next_year_intention",
      sql`next_year_intention in ('returning', 'undecided', 'leaving')`,
    ),
    ck(
      "student_school_years",
      "intention_recorded",
      sql`(next_year_intention is null) = (intention_at is null)`,
    ),

    ck(
      "student_school_years",
      "source",
      sql`source in ('manual', 'import', 'sis', 'oneroster', 'rollover', 'admission')`,
    ),
    ck("student_school_years", "valid_during", range.bounded("valid_during")),
    ck(
      "student_school_years",
      "previous_school",
      sql`char_length(previous_school) between 1 and 160`,
    ),
    ck(
      "student_school_years",
      "destination_school",
      sql`char_length(destination_school) between 1 and 160`,
    ),
    index("student_school_years_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    index("student_school_years_year_idx")
      .on(t.tenantId, t.schoolYearId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    index("student_school_years_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
    ...erase(erasureOf("student_user_id")),
  ],
);

export type RolloverState = "draft" | "applied";

/**
 * The draft that carries a school's classes and students from one year into
 * the next: the classes to create and where each student goes, revised until
 * it is applied once. The applied outcome is kept, so applying again returns
 * it instead of creating anything twice.
 */
export const yearRollovers = core.table.withRLS(
  "year_rollovers",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    sourceYearId: uuid("source_year_id").notNull(),
    sourceYearType: text("source_year_type").notNull().default("school_year"),
    targetYearId: uuid("target_year_id").notNull(),
    targetYearType: text("target_year_type").notNull().default("school_year"),
    state: text("state").$type<RolloverState>().notNull().default("draft"),
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
    outcome: jsonb("outcome").$type<Record<string, unknown>>(),
    appliedAt: instant("applied_at"),
    appliedByUserId: uuid("applied_by_user_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("year_rollovers", t.tenantId, t.id),
    ...baseConstraints("year_rollovers", t, tenants),
    fk(
      "year_rollovers",
      [t.tenantId, t.sourceYearId, t.sourceYearType, t.sourceYearId, t.orgId],
      [
        academicSessions.tenantId,
        academicSessions.id,
        academicSessions.type,
        academicSessions.schoolYearId,
        academicSessions.orgId,
      ],
      "_source",
    ),
    fk(
      "year_rollovers",
      [t.tenantId, t.targetYearId, t.targetYearType, t.targetYearId, t.orgId],
      [
        academicSessions.tenantId,
        academicSessions.id,
        academicSessions.type,
        academicSessions.schoolYearId,
        academicSessions.orgId,
      ],
      "_target",
    ),
    fk(
      "year_rollovers",
      [t.tenantId, t.appliedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "year_rollovers",
      "source_year_type",
      sql`source_year_type = 'school_year'`,
    ),
    ck(
      "year_rollovers",
      "target_year_type",
      sql`target_year_type = 'school_year'`,
    ),
    ck("year_rollovers", "state", sql`state in ('draft', 'applied')`),
    ck("year_rollovers", "years", sql`source_year_id <> target_year_id`),
    ck(
      "year_rollovers",
      "plan",
      sql`jsonb_typeof(plan) = 'object' and octet_length(plan::text) <= 4194304`,
    ),
    ck(
      "year_rollovers",
      "applied",
      sql`(state = 'applied') = (applied_at is not null and outcome is not null)`,
    ),
    uniqueIndex("year_rollovers_years_key")
      .on(t.tenantId, t.sourceYearId, t.targetYearId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
