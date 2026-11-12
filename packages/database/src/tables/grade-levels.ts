import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { index, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { broadcasts } from "./broadcasts";
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
  pk,
  range,
  tenantColumns,
} from "./conventions";
import { descriptors } from "./descriptors";
import { calendarEvents } from "./events";
import { users } from "./people";
import { importRuns } from "./records";
import { classes } from "./teaching";
import { orgs, tenants } from "./tenancy";

export type StudentGradeSource =
  | "manual"
  | "import"
  | "class"
  | "homeroom"
  | "rollover"
  | "admission";

/** The grade or level a class teaches. */
export const classGrades = core.table.withRLS(
  "class_grades",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    gradeLevelDescriptorId: uuid("grade_level_descriptor_id").notNull(),
    gradeLevelNs: text("grade_level_ns")
      .notNull()
      .generatedAlwaysAs(sql`'grade_level'`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("class_grades", t.tenantId, t.id),
    ...baseConstraints("class_grades", t, tenants),
    fk(
      "class_grades",
      [t.tenantId, t.classId, t.orgId],
      [classes.tenantId, classes.id, classes.orgId],
    ),
    fk(
      "class_grades",
      [t.tenantId, t.gradeLevelDescriptorId, t.gradeLevelNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    uniqueIndex("class_grades_class_key")
      .on(t.tenantId, t.classId)
      .where(sql`status = 'active'`),
    index("class_grades_grade_idx")
      .on(t.tenantId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    ...entityProfile({ integration: true }),
  ],
);

/**
 * The grade or level a student is in at a school, over the days it holds:
 * one at a time (`student_grades_excl`), open at the end until it changes.
 */
export const studentGrades = core.table.withRLS(
  "student_grades",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    gradeLevelDescriptorId: uuid("grade_level_descriptor_id").notNull(),
    gradeLevelNs: text("grade_level_ns")
      .notNull()
      .generatedAlwaysAs(sql`'grade_level'`),
    validDuring: daterange("valid_during").notNull(),
    source: text("source").$type<StudentGradeSource>().notNull(),
    importRunId: uuid("import_run_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("student_grades", t.tenantId, t.id),
    ...baseConstraints("student_grades", t, tenants),
    fk("student_grades", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "student_grades",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "student_grades",
      [t.tenantId, t.gradeLevelDescriptorId, t.gradeLevelNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "student_grades",
      [t.tenantId, t.importRunId],
      [importRuns.tenantId, importRuns.id],
    ),
    ck("student_grades", "valid_during", range.started("valid_during")),
    ck(
      "student_grades",
      "source",
      sql`source in ('manual', 'import', 'class', 'homeroom', 'rollover', 'admission')`,
    ),
    index("student_grades_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    index("student_grades_grade_idx")
      .on(t.tenantId, t.orgId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    ...entityProfile({ integration: true }),
    ...erase(erasureOf("student_user_id")),
  ],
);

/** A grade an announcement goes to: its classes' students, their families and teachers. */
export const broadcastGrades = core.table.withRLS(
  "broadcast_grades",
  {
    ...tenantColumns(),
    broadcastId: uuid("broadcast_id").notNull(),
    gradeLevelDescriptorId: uuid("grade_level_descriptor_id").notNull(),
    gradeLevelNs: text("grade_level_ns")
      .notNull()
      .generatedAlwaysAs(sql`'grade_level'`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("broadcast_grades", t.tenantId, t.id),
    ...baseConstraints("broadcast_grades", t, tenants),
    fk(
      "broadcast_grades",
      [t.tenantId, t.broadcastId],
      [broadcasts.tenantId, broadcasts.id],
    ),
    fk(
      "broadcast_grades",
      [t.tenantId, t.gradeLevelDescriptorId, t.gradeLevelNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    uniqueIndex("broadcast_grades_key")
      .on(t.tenantId, t.broadcastId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    index("broadcast_grades_grade_idx")
      .on(t.tenantId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/** A grade a calendar event is for, as a broadcast's. */
export const calendarEventGrades = core.table.withRLS(
  "calendar_event_grades",
  {
    ...tenantColumns(),
    eventId: uuid("event_id").notNull(),
    gradeLevelDescriptorId: uuid("grade_level_descriptor_id").notNull(),
    gradeLevelNs: text("grade_level_ns")
      .notNull()
      .generatedAlwaysAs(sql`'grade_level'`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("calendar_event_grades", t.tenantId, t.id),
    ...baseConstraints("calendar_event_grades", t, tenants),
    fk(
      "calendar_event_grades",
      [t.tenantId, t.eventId],
      [calendarEvents.tenantId, calendarEvents.id],
    ),
    fk(
      "calendar_event_grades",
      [t.tenantId, t.gradeLevelDescriptorId, t.gradeLevelNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    uniqueIndex("calendar_event_grades_key")
      .on(t.tenantId, t.eventId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    index("calendar_event_grades_grade_idx")
      .on(t.tenantId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
