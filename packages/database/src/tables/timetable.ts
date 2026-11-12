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
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { ClassType } from "./teaching";

import { academicSessions, classPeriods } from "./calendar";
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
import { tenants } from "./tenancy";

/**
 * A timetable of a school year, followed from its first day until the next
 * one starts; the first is followed from the start of the year. It says how
 * its lessons repeat: a cycle of weeks (one, or A and B) or of school days.
 */
export const timetables = core.table.withRLS(
  "timetables",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
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
    uq("timetables", t.tenantId, t.id, t.schoolYearId, t.orgId),
    ...baseConstraints("timetables", t, tenants),
    fk(
      "timetables",
      [t.tenantId, t.schoolYearId, t.schoolYearType, t.schoolYearId, t.orgId],
      [
        academicSessions.tenantId,
        academicSessions.id,
        academicSessions.type,
        academicSessions.schoolYearId,
        academicSessions.orgId,
      ],
    ),
    ck("timetables", "school_year_type", sql`school_year_type = 'school_year'`),
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
      .on(t.tenantId, t.schoolYearId, t.startsOn)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

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
      [t.tenantId, t.timetableId, t.schoolYearId, t.orgId],
      [
        timetables.tenantId,
        timetables.id,
        timetables.schoolYearId,
        timetables.orgId,
      ],
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
    ck("class_meetings", "weekday", sql`weekday between 1 and 28`),
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
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
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
    fk(
      "staff_absences",
      [t.tenantId, t.schoolYearId, t.schoolYearType, t.schoolYearId, t.orgId],
      [
        academicSessions.tenantId,
        academicSessions.id,
        academicSessions.type,
        academicSessions.schoolYearId,
        academicSessions.orgId,
      ],
    ),
    fk("staff_absences", [t.tenantId, t.userId], [users.tenantId, users.id]),
    ck(
      "staff_absences",
      "school_year_type",
      sql`school_year_type = 'school_year'`,
    ),
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
    schoolYearId: uuid("school_year_id").notNull(),
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
      [t.tenantId, t.classPeriodId, t.schoolYearId, t.orgId],
      [
        classPeriods.tenantId,
        classPeriods.id,
        classPeriods.schoolYearId,
        classPeriods.orgId,
      ],
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
