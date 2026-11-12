import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { date, index, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  daterange,
  entityColumns,
  entityProfile,
  fk,
  pk,
  range,
  tenantColumns,
  uq,
} from "./conventions";
import { classes, enrollments } from "./teaching";
import { tenants } from "./tenancy";

/** A class that is a homeroom: the class its students belong to. */
export const homerooms = core.table.withRLS(
  "homerooms",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("homerooms", t.tenantId, t.id),
    uq("homerooms", t.tenantId, t.classId),
    uq("homerooms", t.tenantId, t.classId, t.orgId),
    ...baseConstraints("homerooms", t, tenants),
    fk(
      "homerooms",
      [t.tenantId, t.classId, t.orgId],
      [classes.tenantId, classes.id, classes.orgId],
    ),
    ...entityProfile(),
  ],
);

/**
 * A subject class taught to a homeroom, whose students are the homeroom's
 * from the day it joined.
 */
export const homeroomClasses = core.table.withRLS(
  "homeroom_classes",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    homeroomClassId: uuid("homeroom_class_id").notNull(),
    classId: uuid("class_id").notNull(),
    linkedOn: date("linked_on", { mode: "string" }).notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("homeroom_classes", t.tenantId, t.id),
    ...baseConstraints("homeroom_classes", t, tenants),
    fk(
      "homeroom_classes",
      [t.tenantId, t.homeroomClassId, t.orgId],
      [homerooms.tenantId, homerooms.classId, homerooms.orgId],
    ),
    fk(
      "homeroom_classes",
      [t.tenantId, t.classId, t.orgId],
      [classes.tenantId, classes.id, classes.orgId],
    ),
    ck("homeroom_classes", "class_id", sql`class_id <> homeroom_class_id`),
    uniqueIndex("homeroom_classes_class_key")
      .on(t.tenantId, t.classId)
      .where(sql`status = 'active'`),
    index("homeroom_classes_homeroom_idx")
      .on(t.tenantId, t.homeroomClassId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A student's place in a homeroom: their enrollment in the homeroom class,
 * whose class, student, dates and state it repeats under a cascading key,
 * so whatever ends, shortens or gives back that enrollment moves the place
 * with it. A student holds one place at a time (`homeroom_members_excl`).
 */
export const homeroomMembers = core.table.withRLS(
  "homeroom_members",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    homeroomClassId: uuid("homeroom_class_id").notNull(),
    enrollmentId: uuid("enrollment_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    validDuring: daterange("valid_during").notNull(),
    source: text("source").$type<"manual" | "rollover">().notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("homeroom_members", t.tenantId, t.id),
    uq("homeroom_members", t.tenantId, t.enrollmentId),
    ...baseConstraints("homeroom_members", t, tenants),
    fk(
      "homeroom_members",
      [t.tenantId, t.homeroomClassId, t.orgId],
      [homerooms.tenantId, homerooms.classId, homerooms.orgId],
    ),
    fk(
      "homeroom_members",
      [
        t.tenantId,
        t.enrollmentId,
        t.homeroomClassId,
        t.studentUserId,
        t.orgId,
        t.validDuring,
        t.status,
      ],
      [
        enrollments.tenantId,
        enrollments.id,
        enrollments.classId,
        enrollments.userId,
        enrollments.orgId,
        enrollments.validDuring,
        enrollments.status,
      ],
    ).onUpdate("cascade"),
    ck("homeroom_members", "source", sql`source in ('manual', 'rollover')`),
    ck("homeroom_members", "valid_during", range.bounded("valid_during")),
    index("homeroom_members_homeroom_idx")
      .on(t.tenantId, t.homeroomClassId)
      .where(sql`status = 'active'`),
    index("homeroom_members_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
