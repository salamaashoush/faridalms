import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { date, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { attendanceRegisters } from "./attendance";
import {
  baseConstraints,
  core,
  entityColumns,
  entityProfile,
  fk,
  pk,
  tenantColumns,
} from "./conventions";
import { tenants } from "./tenancy";
import { classPeriods } from "./timetable";

/**
 * The period a period register was taken in. Attendance keeps it where the
 * timetable plans the day; one class has one register in a period of a day.
 */
export const registerPeriods = core.table.withRLS(
  "register_periods",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    registerId: uuid("register_id").notNull(),
    classId: uuid("class_id").notNull(),
    takenOn: date("taken_on", { mode: "string" }).notNull(),
    classPeriodId: uuid("class_period_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("register_periods", t.tenantId, t.id),
    ...baseConstraints("register_periods", t, tenants),
    fk(
      "register_periods",
      [t.tenantId, t.registerId, t.classId, t.takenOn],
      [
        attendanceRegisters.tenantId,
        attendanceRegisters.id,
        attendanceRegisters.classId,
        attendanceRegisters.takenOn,
      ],
    ),
    fk(
      "register_periods",
      [t.tenantId, t.classPeriodId, t.orgId],
      [classPeriods.tenantId, classPeriods.id, classPeriods.orgId],
    ),
    uniqueIndex("register_periods_register_key")
      .on(t.tenantId, t.registerId)
      .where(sql`status = 'active'`),
    uniqueIndex("register_periods_key")
      .on(t.tenantId, t.classId, t.takenOn, t.classPeriodId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
