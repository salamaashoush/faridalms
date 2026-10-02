import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
  instant,
  pk,
  tenantColumns,
  uq,
} from "./conventions";
import { users } from "./people";
import { classes } from "./teaching";
import { orgs, tenants } from "./tenancy";

/** A school's attendance rules; a school without a row uses the defaults. */
export const attendanceSettings = core.table.withRLS(
  "attendance_settings",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    teacherEditDays: smallint("teacher_edit_days").notNull(),
    noticeDelayMinutes: smallint("notice_delay_minutes").notNull(),
    chronicPercent: smallint("chronic_percent").notNull(),
    /** Children may mark themselves in on the classroom's touch screen. */
    checkInTouch: boolean("check_in_touch").notNull().default(false),
    /** Children may mark themselves in by holding their badge to a camera. */
    checkInQr: boolean("check_in_qr").notNull().default(false),
    /** Children may mark themselves in by tapping a card holding their badge. */
    checkInNfc: boolean("check_in_nfc").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("attendance_settings", t.tenantId, t.id),
    ...baseConstraints("attendance_settings", t, tenants),
    fk("attendance_settings", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck(
      "attendance_settings",
      "teacher_edit_days",
      sql`teacher_edit_days between 0 and 60`,
    ),
    ck(
      "attendance_settings",
      "notice_delay_minutes",
      sql`notice_delay_minutes between 0 and 1440`,
    ),
    ck(
      "attendance_settings",
      "chronic_percent",
      sql`chronic_percent between 1 and 50`,
    ),
    uniqueIndex("attendance_settings_org_key")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export type RegisterState = "in_progress" | "submitted";

/**
 * Ed-Fi's section attendance taken: one class's register for one period of
 * one day. Its marks are `attendance_events`, which hang off it by date.
 */
export const attendanceRegisters = core.table.withRLS(
  "attendance_registers",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    classType: text("class_type").$type<ClassType>().notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
    classPeriodId: uuid("class_period_id").notNull(),
    takenOn: date("taken_on", { mode: "string" }).notNull(),
    span: daterange("span")
      .notNull()
      .generatedAlwaysAs(sql`daterange(taken_on, taken_on + 1, '[)')`),
    state: text("state").$type<RegisterState>().notNull(),
    recordedByUserId: uuid("recorded_by_user_id").notNull(),
    submittedAt: instant("submitted_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("attendance_registers", t.tenantId, t.id),
    uq("attendance_registers", t.tenantId, t.id, t.takenOn),
    ...baseConstraints("attendance_registers", t, tenants),
    fk(
      "attendance_registers",
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
      "attendance_registers",
      [t.tenantId, t.classPeriodId, t.schoolYearId, t.orgId],
      [
        classPeriods.tenantId,
        classPeriods.id,
        classPeriods.schoolYearId,
        classPeriods.orgId,
      ],
    ),
    fk(
      "attendance_registers",
      [t.tenantId, t.recordedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "attendance_registers",
      "school_year_type",
      sql`school_year_type = 'school_year'`,
    ),
    ck(
      "attendance_registers",
      "state",
      sql`state in ('in_progress', 'submitted')`,
    ),
    ck(
      "attendance_registers",
      "submitted_at",
      sql`(state = 'submitted') = (submitted_at is not null)`,
    ),
    uniqueIndex("attendance_registers_key")
      .on(t.tenantId, t.classId, t.takenOn, t.classPeriodId)
      .where(sql`status = 'active'`),
    index("attendance_registers_day_idx")
      .on(t.tenantId, t.orgId, t.takenOn)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
