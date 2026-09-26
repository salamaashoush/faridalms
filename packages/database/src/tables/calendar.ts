import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
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
import { descriptors } from "./descriptors";
import { orgs, tenants } from "./tenancy";

export type SessionType =
  | "school_year"
  | "semester"
  | "term"
  | "grading_period";
export type YearLifecycle = "upcoming" | "current" | "closed";

export const academicSessions = core.table.withRLS(
  "academic_sessions",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    orgType: text("org_type").notNull().default("school"),
    type: text("type").$type<SessionType>().notNull(),
    parentId: uuid("parent_id"),
    parentType: text("parent_type").$type<SessionType>(),
    schoolYearId: uuid("school_year_id").notNull(),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    span: daterange("span").notNull(),
    schoolYear: smallint("school_year").notNull(),
    lifecycle: text("lifecycle").$type<YearLifecycle>(),
    sequence: smallint("sequence").notNull().default(1),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("academic_sessions", t.tenantId, t.id),
    uq("academic_sessions", t.tenantId, t.id, t.type, t.schoolYearId, t.orgId),
    uq(
      "academic_sessions",
      t.tenantId,
      t.id,
      t.type,
      t.schoolYearId,
      t.orgId,
      t.schoolYear,
    ),
    ...baseConstraints("academic_sessions", t, tenants),
    fk(
      "academic_sessions",
      [t.tenantId, t.orgId, t.orgType],
      [orgs.tenantId, orgs.id, orgs.type],
    ),
    fk(
      "academic_sessions",
      [
        t.tenantId,
        t.parentId,
        t.parentType,
        t.schoolYearId,
        t.orgId,
        t.schoolYear,
      ],
      [t.tenantId, t.id, t.type, t.schoolYearId, t.orgId, t.schoolYear],
    ),
    ck("academic_sessions", "org_type", sql`org_type = 'school'`),
    ck(
      "academic_sessions",
      "type",
      sql`type in ('school_year', 'semester', 'term', 'grading_period')`,
    ),
    ck(
      "academic_sessions",
      "title_en",
      sql`char_length(title_en) between 1 and 80`,
    ),
    ck(
      "academic_sessions",
      "title_ar",
      sql`char_length(title_ar) between 1 and 80`,
    ),
    ck(
      "academic_sessions",
      "school_year",
      sql`school_year between 2000 and 2200`,
    ),
    ck(
      "academic_sessions",
      "lifecycle",
      sql`lifecycle in ('upcoming', 'current', 'closed')`,
    ),
    ck("academic_sessions", "sequence", sql`sequence between 1 and 99`),
    ck(
      "academic_sessions",
      "title",
      sql`num_nonnulls(title_en, title_ar) >= 1`,
    ),
    ck("academic_sessions", "span", range.bounded("span")),
    ck(
      "academic_sessions",
      "parent_pair",
      sql`(parent_id is null) = (parent_type is null)`,
    ),
    ck(
      "academic_sessions",
      "tree",
      sql`(type = 'school_year' and parent_id is null and school_year_id = id) or (type = 'semester' and parent_type = 'school_year') or (type = 'term' and parent_type in ('school_year', 'semester')) or (type = 'grading_period' and parent_type in ('school_year', 'semester', 'term'))`,
    ),
    ck(
      "academic_sessions",
      "year_end",
      sql`type <> 'school_year' or school_year = extract(year from upper(span) - 1)`,
    ),
    ck(
      "academic_sessions",
      "lifecycle_type",
      sql`(type = 'school_year') = (lifecycle is not null)`,
    ),
    uniqueIndex("academic_sessions_current_key")
      .on(t.tenantId, t.orgId)
      .where(
        sql`type = 'school_year' and lifecycle = 'current' and status = 'active'`,
      ),
    index("academic_sessions_year_idx").on(t.tenantId, t.schoolYearId, t.type),
    index("academic_sessions_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
  ],
);

export const calendars = core.table.withRLS(
  "calendars",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
    code: text("code").notNull(),
    kind: text("kind").$type<"school" | "grade_level" | "staff">().notNull(),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("calendars", t.tenantId, t.id),
    uq("calendars", t.tenantId, t.id, t.schoolYearId),
    ...baseConstraints("calendars", t, tenants),
    fk(
      "calendars",
      [t.tenantId, t.schoolYearId, t.schoolYearType, t.schoolYearId, t.orgId],
      [
        academicSessions.tenantId,
        academicSessions.id,
        academicSessions.type,
        academicSessions.schoolYearId,
        academicSessions.orgId,
      ],
    ),
    ck("calendars", "school_year_type", sql`school_year_type = 'school_year'`),
    ck("calendars", "code", sql`code ~ '^[A-Za-z0-9_-]{1,60}$'`),
    ck("calendars", "kind", sql`kind in ('school', 'grade_level', 'staff')`),
    ck("calendars", "title_en", sql`char_length(title_en) between 1 and 80`),
    ck("calendars", "title_ar", sql`char_length(title_ar) between 1 and 80`),
    ck("calendars", "title", sql`num_nonnulls(title_en, title_ar) >= 1`),
    uniqueIndex("calendars_code_key")
      .on(t.tenantId, t.schoolYearId, t.code)
      .where(sql`status = 'active'`),
    uniqueIndex("calendars_school_key")
      .on(t.tenantId, t.schoolYearId)
      .where(sql`kind = 'school' and status = 'active'`),
    ...entityProfile({ integration: true }),
  ],
);

export const calendarGradeLevels = core.table.withRLS(
  "calendar_grade_levels",
  {
    ...tenantColumns(),
    calendarId: uuid("calendar_id").notNull(),
    gradeLevelDescriptorId: uuid("grade_level_descriptor_id").notNull(),
    gradeLevelNs: text("grade_level_ns")
      .notNull()
      .generatedAlwaysAs(sql`'grade_level'`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("calendar_grade_levels", t.tenantId, t.id),
    ...baseConstraints("calendar_grade_levels", t, tenants),
    fk(
      "calendar_grade_levels",
      [t.tenantId, t.calendarId],
      [calendars.tenantId, calendars.id],
    ),
    fk(
      "calendar_grade_levels",
      [t.tenantId, t.gradeLevelDescriptorId, t.gradeLevelNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    uniqueIndex("calendar_grade_levels_key")
      .on(t.tenantId, t.calendarId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    ...entityProfile({ integration: true }),
  ],
);

export const calendarDates = core.table.withRLS(
  "calendar_dates",
  {
    ...tenantColumns(),
    calendarId: uuid("calendar_id").notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
    dayOn: date("day_on", { mode: "string" }).notNull(),
    span: daterange("span")
      .notNull()
      .generatedAlwaysAs(sql`daterange(day_on, day_on + 1, '[)')`),
    eventDescriptorId: uuid("event_descriptor_id").notNull(),
    eventNs: text("event_ns")
      .notNull()
      .generatedAlwaysAs(sql`'calendar_event'`),
    noteEn: text("note_en"),
    noteAr: text("note_ar"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("calendar_dates", t.tenantId, t.id),
    ...baseConstraints("calendar_dates", t, tenants),
    fk(
      "calendar_dates",
      [t.tenantId, t.calendarId, t.schoolYearId],
      [calendars.tenantId, calendars.id, calendars.schoolYearId],
    ),
    fk(
      "calendar_dates",
      [t.tenantId, t.eventDescriptorId, t.eventNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    ck(
      "calendar_dates",
      "school_year_type",
      sql`school_year_type = 'school_year'`,
    ),
    ck(
      "calendar_dates",
      "note_en",
      sql`char_length(note_en) between 1 and 200`,
    ),
    ck(
      "calendar_dates",
      "note_ar",
      sql`char_length(note_ar) between 1 and 200`,
    ),
    uniqueIndex("calendar_dates_day_key")
      .on(t.tenantId, t.calendarId, t.dayOn)
      .where(sql`status = 'active'`),
    ...entityProfile({ integration: true }),
  ],
);

export const academicWeeks = core.table.withRLS(
  "academic_weeks",
  {
    ...tenantColumns(),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
    number: smallint("number").notNull(),
    span: daterange("span").notNull(),
    labelEn: text("label_en"),
    labelAr: text("label_ar"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("academic_weeks", t.tenantId, t.id),
    ...baseConstraints("academic_weeks", t, tenants),
    ck(
      "academic_weeks",
      "school_year_type",
      sql`school_year_type = 'school_year'`,
    ),
    ck("academic_weeks", "number", sql`number between 1 and 60`),
    ck(
      "academic_weeks",
      "label_en",
      sql`char_length(label_en) between 1 and 40`,
    ),
    ck(
      "academic_weeks",
      "label_ar",
      sql`char_length(label_ar) between 1 and 40`,
    ),
    ck(
      "academic_weeks",
      "span",
      sql`${range.bounded("span")} and upper(span) - lower(span) <= 7`,
    ),
    uniqueIndex("academic_weeks_number_key")
      .on(t.tenantId, t.schoolYearId, t.number)
      .where(sql`status = 'active'`),
    ...entityProfile({ integration: true }),
  ],
);

export type PeriodKind = "lesson" | "registration" | "break" | "other";

export const classPeriods = core.table.withRLS(
  "class_periods",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
    code: text("code").notNull(),
    nameEn: text("name_en"),
    nameAr: text("name_ar"),
    sequence: smallint("sequence").notNull(),
    kind: text("kind").$type<PeriodKind>().notNull().default("lesson"),
    startTime: time("start_time"),
    endTime: time("end_time"),
    officialAttendance: boolean("official_attendance").notNull().default(false),
    validDuring: daterange("valid_during").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("class_periods", t.tenantId, t.id),
    ...baseConstraints("class_periods", t, tenants),
    fk(
      "class_periods",
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
      "class_periods",
      "school_year_type",
      sql`school_year_type = 'school_year'`,
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
    ck("class_periods", "valid_during", range.bounded("valid_during")),
    ...entityProfile({ integration: true }),
  ],
);
