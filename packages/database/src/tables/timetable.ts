import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { boolean, index, smallint, text, uuid } from "drizzle-orm/pg-core";

import type { ClassType } from "./teaching";

import { classPeriods } from "./calendar";
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
} from "./conventions";
import { locations } from "./files";
import { users } from "./people";
import { classes } from "./teaching";
import { tenants } from "./tenancy";

/**
 * Ed-Fi's section class period on a day of the week: when a class meets, who
 * teaches it there and in which room. A change from a date ends the row and
 * starts another, so a past week reads as it was taught.
 */
export const classMeetings = core.table.withRLS(
  "class_meetings",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    classType: text("class_type").$type<ClassType>().notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
    /** The homeroom whose students the class takes, or the class itself. */
    groupClassId: uuid("group_class_id").notNull(),
    weekday: smallint("weekday").notNull(),
    classPeriodId: uuid("class_period_id").notNull(),
    teacherUserId: uuid("teacher_user_id"),
    locationId: uuid("location_id"),
    validDuring: daterange("valid_during").notNull(),
    /** Someone chose to keep this meeting though its teacher or room is booked. */
    clashAccepted: boolean("clash_accepted").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("class_meetings", t.tenantId, t.id),
    ...baseConstraints("class_meetings", t, tenants),
    fk(
      "class_meetings",
      [t.tenantId, t.classId, t.classType, t.schoolYearId, t.orgId],
      [
        classes.tenantId,
        classes.id,
        classes.classType,
        classes.schoolYearId,
        classes.orgId,
      ],
    ),
    fk(
      "class_meetings",
      [t.tenantId, t.groupClassId],
      [classes.tenantId, classes.id],
    ),
    fk(
      "class_meetings",
      [t.tenantId, t.classPeriodId, t.schoolYearId, t.orgId],
      [
        classPeriods.tenantId,
        classPeriods.id,
        classPeriods.schoolYearId,
        classPeriods.orgId,
      ],
    ),
    fk(
      "class_meetings",
      [t.tenantId, t.teacherUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "class_meetings",
      [t.tenantId, t.locationId],
      [locations.tenantId, locations.id],
    ),
    ck(
      "class_meetings",
      "school_year_type",
      sql`school_year_type = 'school_year'`,
    ),
    ck("class_meetings", "weekday", sql`weekday between 1 and 7`),
    ck("class_meetings", "valid_during", range.bounded("valid_during")),
    index("class_meetings_group_idx")
      .on(t.tenantId, t.groupClassId)
      .where(sql`status = 'active'`),
    index("class_meetings_teacher_idx")
      .on(t.tenantId, t.teacherUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
