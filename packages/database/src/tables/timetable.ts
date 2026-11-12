import type {
  CycleKind,
  StaffAbsenceReason,
} from "@faridalms/domain/timetable";
import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  jsonb,
  smallint,
  text,
  time,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
import { locations } from "./files";
import { users } from "./people";
import { classes } from "./teaching";
import { orgs, tenants } from "./tenancy";

/** A bell schedule's times for one period, keyed by the period's code. */
export interface BellTimesRow {
  code: string;
  startTime: string;
  endTime: string;
}

/**
 * Days run on other times than their periods' own (a late start, an exam
 * day, Ramadan hours): the periods held, each at its time that day. Days
 * choose it in `timetable_days`.
 */
export const bellSchedules = core.table.withRLS(
  "bell_schedules",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    nameEn: text("name_en"),
    nameAr: text("name_ar"),
    /** A period left out is not held on the schedule's days. */
    times: jsonb("times").$type<BellTimesRow[]>().notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("bell_schedules", t.tenantId, t.id),
    uq("bell_schedules", t.tenantId, t.id, t.orgId),
    ...baseConstraints("bell_schedules", t, tenants),
    fk("bell_schedules", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("bell_schedules", "name_en", sql`char_length(name_en) between 1 and 60`),
    ck("bell_schedules", "name_ar", sql`char_length(name_ar) between 1 and 60`),
    ck("bell_schedules", "name", sql`num_nonnulls(name_en, name_ar) >= 1`),
    ck(
      "bell_schedules",
      "times",
      sql`jsonb_typeof(times) = 'array' and jsonb_array_length(times) between 0 and 50`,
    ),
    index("bell_schedules_school_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export type PeriodKind = "lesson" | "registration" | "break" | "other";

/**
 * A period of the school's day. A change from a date ends the row and
 * starts another, so the days before read as they were; the last version
 * runs on with no end. A bell schedule's own period is held on every day
 * that runs on its schedule, so it has no dates of its own.
 */
export const classPeriods = core.table.withRLS(
  "class_periods",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    code: text("code").notNull(),
    nameEn: text("name_en"),
    nameAr: text("name_ar"),
    sequence: smallint("sequence").notNull(),
    kind: text("kind").$type<PeriodKind>().notNull().default("lesson"),
    startTime: time("start_time"),
    endTime: time("end_time"),
    officialAttendance: boolean("official_attendance").notNull().default(false),
    /** ISO days of the week it runs on, of the school's teaching days. */
    weekdays: smallint("weekdays")
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5,6,7}'`),
    /** Other times it keeps on some of its days of the week. */
    dayTimes: jsonb("day_times")
      .$type<{ weekdays: number[]; startTime: string; endTime: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    validDuring: daterange("valid_during").notNull(),
    /** The bell schedule whose days alone hold it, beyond the school's own periods. */
    bellScheduleId: uuid("bell_schedule_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("class_periods", t.tenantId, t.id),
    uq("class_periods", t.tenantId, t.id, t.orgId),
    ...baseConstraints("class_periods", t, tenants),
    fk("class_periods", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "class_periods",
      [t.tenantId, t.bellScheduleId, t.orgId],
      [bellSchedules.tenantId, bellSchedules.id, bellSchedules.orgId],
    ),
    ck("class_periods", "code", sql`code ~ '^[A-Za-z0-9_-]{1,20}$'`),
    ck("class_periods", "name_en", sql`char_length(name_en) between 1 and 60`),
    ck("class_periods", "name_ar", sql`char_length(name_ar) between 1 and 60`),
    ck("class_periods", "sequence", sql`sequence between 1 and 50`),
    ck(
      "class_periods",
      "kind",
      sql`kind in ('lesson', 'registration', 'break', 'other')`,
    ),
    ck("class_periods", "name", sql`num_nonnulls(name_en, name_ar) >= 1`),
    ck(
      "class_periods",
      "times",
      sql`(start_time is null) = (end_time is null) and (end_time is null or end_time > start_time)`,
    ),
    ck(
      "class_periods",
      "weekdays",
      sql`weekdays <@ '{1,2,3,4,5,6,7}' and cardinality(weekdays) between 1 and 7`,
    ),
    ck(
      "class_periods",
      "day_times",
      sql`jsonb_typeof(day_times) = 'array' and jsonb_array_length(day_times) <= 6`,
    ),
    ck(
      "class_periods",
      "valid_during",
      sql`(bell_schedule_id is null and ${range.started("valid_during")})
        or (bell_schedule_id is not null and lower_inf(valid_during) and upper_inf(valid_during))`,
    ),
    ck(
      "class_periods",
      "extra",
      sql`bell_schedule_id is null or not official_attendance`,
    ),
    uniqueIndex("class_periods_extra_code_key")
      .on(t.tenantId, t.bellScheduleId, t.code)
      .where(sql`status = 'active' and bell_schedule_id is not null`),
    ...entityProfile({ integration: true }),
  ],
);

/**
 * How the timetable runs one date of a school: on a bell schedule's times,
 * as another day of its cycle, or both. A date the school closes keeps its
 * row and holds nothing.
 */
export const timetableDays = core.table.withRLS(
  "timetable_days",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    dayOn: date("day_on", { mode: "string" }).notNull(),
    /** The other times the day runs on; none keeps its periods' own. */
    bellScheduleId: uuid("bell_schedule_id"),
    /** The day of the timetable's cycle it runs as instead of its own. */
    runsAs: smallint("runs_as"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("timetable_days", t.tenantId, t.id),
    ...baseConstraints("timetable_days", t, tenants),
    fk("timetable_days", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "timetable_days",
      [t.tenantId, t.bellScheduleId, t.orgId],
      [bellSchedules.tenantId, bellSchedules.id, bellSchedules.orgId],
    ),
    ck("timetable_days", "runs_as", sql`runs_as between 1 and 28`),
    ck(
      "timetable_days",
      "shape",
      sql`num_nonnulls(bell_schedule_id, runs_as) >= 1`,
    ),
    uniqueIndex("timetable_days_day_key")
      .on(t.tenantId, t.orgId, t.dayOn)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A school's timetable, followed from its first day until the next one
 * starts; the earliest is followed on every day before it too. It says how
 * its lessons repeat: a cycle of weeks (one, or A and B) or of school days.
 */
export const timetables = core.table.withRLS(
  "timetables",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    nameEn: text("name_en"),
    nameAr: text("name_ar"),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    cycleKind: text("cycle_kind").$type<CycleKind>().notNull(),
    cycleLength: smallint("cycle_length").notNull(),
    /** The week or day of the cycle its first school day is. */
    firstDay: smallint("first_day").notNull().default(1),
    /** Closed days and weeks leave the cycle where it was instead of using up their place. */
    closuresMove: boolean("closures_move").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("timetables", t.tenantId, t.id),
    uq("timetables", t.tenantId, t.id, t.orgId),
    ...baseConstraints("timetables", t, tenants),
    fk("timetables", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("timetables", "name_en", sql`char_length(name_en) between 1 and 60`),
    ck("timetables", "name_ar", sql`char_length(name_ar) between 1 and 60`),
    ck(
      "timetables",
      "cycle",
      sql`(cycle_kind = 'weeks' and cycle_length between 1 and 4)
        or (cycle_kind = 'days' and cycle_length between 2 and 20)`,
    ),
    ck("timetables", "first_day", sql`first_day between 1 and cycle_length`),
    uniqueIndex("timetables_start_key")
      .on(t.tenantId, t.orgId, t.startsOn)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * Ed-Fi's section class period on a day of the week: when a class meets, who
 * teaches it there and in which room. A change from a date ends the row and
 * starts another, so a past week reads as it was taught. It is held only on
 * days its class runs; no key ties it to them, so the class's dates stay
 * the class's to change.
 */
export const classMeetings = core.table.withRLS(
  "class_meetings",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    /** The timetable it belongs to, which is followed only on its own days. */
    timetableId: uuid("timetable_id").notNull(),
    /** The day of its timetable's cycle: the ISO weekday in an ordinary week. */
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
      [t.tenantId, t.classId, t.orgId],
      [classes.tenantId, classes.id, classes.orgId],
    ),
    fk(
      "class_meetings",
      [t.tenantId, t.timetableId, t.orgId],
      [timetables.tenantId, timetables.id, timetables.orgId],
    ),
    fk(
      "class_meetings",
      [t.tenantId, t.classPeriodId, t.orgId],
      [classPeriods.tenantId, classPeriods.id, classPeriods.orgId],
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
    ck("class_meetings", "weekday", sql`weekday between 1 and 28`),
    ck("class_meetings", "valid_during", range.started("valid_during")),
    index("class_meetings_class_idx")
      .on(t.tenantId, t.classId)
      .where(sql`status = 'active'`),
    index("class_meetings_teacher_idx")
      .on(t.tenantId, t.teacherUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A member of staff away from school for whole days or some periods of each
 * day, which leaves their lessons to cover. The reason stays with those who
 * arrange cover.
 */
export const staffAbsences = core.table.withRLS(
  "staff_absences",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    userId: uuid("user_id").notNull(),
    span: daterange("span").notNull(),
    /** The periods missed on each day of the span; none means whole days. */
    periodIds: uuid("period_ids").array(),
    reason: text("reason").$type<StaffAbsenceReason>().notNull(),
    note: text("note"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("staff_absences", t.tenantId, t.id),
    ...baseConstraints("staff_absences", t, tenants),
    fk("staff_absences", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk("staff_absences", [t.tenantId, t.userId], [users.tenantId, users.id]),
    ck("staff_absences", "span", range.bounded("span")),
    ck(
      "staff_absences",
      "period_ids",
      sql`period_ids is null or cardinality(period_ids) between 1 and 50`,
    ),
    ck(
      "staff_absences",
      "reason",
      sql`reason in ('illness', 'training', 'school_trip', 'personal', 'other')`,
    ),
    ck("staff_absences", "note", sql`char_length(note) between 1 and 500`),
    index("staff_absences_user_idx")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * One day's change to a timetabled lesson: someone covers it, it meets in
 * another room, or it does not happen. Keyed by class, period and day rather
 * than by meeting, so a timetable edit from an earlier day leaves it in place.
 */
export const lessonChanges = core.table.withRLS(
  "lesson_changes",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    classPeriodId: uuid("class_period_id").notNull(),
    dayOn: date("day_on", { mode: "string" }).notNull(),
    /** Who teaches it that day instead; none keeps its own teacher. */
    coverUserId: uuid("cover_user_id"),
    /** Where it meets that day instead; none keeps its own room. */
    locationId: uuid("location_id"),
    cancelled: boolean("cancelled").notNull().default(false),
    /** For the cover teacher: the work set, where the books are. */
    note: text("note"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lesson_changes", t.tenantId, t.id),
    ...baseConstraints("lesson_changes", t, tenants),
    fk(
      "lesson_changes",
      [t.tenantId, t.classId],
      [classes.tenantId, classes.id],
    ),
    fk(
      "lesson_changes",
      [t.tenantId, t.classPeriodId, t.orgId],
      [classPeriods.tenantId, classPeriods.id, classPeriods.orgId],
    ),
    fk(
      "lesson_changes",
      [t.tenantId, t.coverUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "lesson_changes",
      [t.tenantId, t.locationId],
      [locations.tenantId, locations.id],
    ),
    ck(
      "lesson_changes",
      "shape",
      sql`(cancelled and cover_user_id is null and location_id is null)
        or (not cancelled and (cover_user_id is not null or location_id is not null))`,
    ),
    ck("lesson_changes", "note", sql`char_length(note) between 1 and 1000`),
    uniqueIndex("lesson_changes_key")
      .on(t.tenantId, t.classId, t.classPeriodId, t.dayOn)
      .where(sql`status = 'active'`),
    index("lesson_changes_day_idx")
      .on(t.tenantId, t.dayOn)
      .where(sql`status = 'active'`),
    index("lesson_changes_cover_idx")
      .on(t.tenantId, t.coverUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
