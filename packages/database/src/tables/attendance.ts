import type {
  AbsenceReportKind,
  AbsenceReportStatus,
  ContactOutcome,
} from "@faridalms/domain/attendance";
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
  instant,
  pk,
  range,
  tenantColumns,
  uq,
} from "./conventions";
import { descriptors } from "./descriptors";
import { files } from "./files";
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
    /** Minutes after a period starts before an arrival counts as late. */
    lateAfterMinutes: smallint("late_after_minutes").notNull().default(5),
    /** Minutes after a period starts when its register closes. */
    registerClosesMinutes: smallint("register_closes_minutes")
      .notNull()
      .default(30),
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
    ck(
      "attendance_settings",
      "lateness",
      sql`late_after_minutes between 0 and 60
        and register_closes_minutes between 5 and 240
        and late_after_minutes < register_closes_minutes`,
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

/**
 * What a family tells the school ahead of a register: a child will be away,
 * arrive late or leave early, for a reason. Leave asked for in advance is
 * the same report with later days. The office accepts or declines it; an
 * accepted report gives the marks on its days their reason.
 */
export const absenceReports = core.table.withRLS(
  "absence_reports",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
    studentUserId: uuid("student_user_id").notNull(),
    reportedByUserId: uuid("reported_by_user_id").notNull(),
    kind: text("kind").$type<AbsenceReportKind>().notNull(),
    span: daterange("span").notNull(),
    /** When a child arrives or leaves, for a late arrival or early leave. */
    at: time("at"),
    reasonDescriptorId: uuid("reason_descriptor_id").notNull(),
    reasonNs: text("reason_ns")
      .notNull()
      .generatedAlwaysAs(sql`'attendance_reason'`),
    note: text("note"),
    /** A doctor's note or letter the family attached. */
    fileId: uuid("file_id"),
    decision: text("decision")
      .$type<AbsenceReportStatus>()
      .notNull()
      .default("pending"),
    decidedByUserId: uuid("decided_by_user_id"),
    decidedAt: instant("decided_at"),
    decisionNote: text("decision_note"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("absence_reports", t.tenantId, t.id),
    ...baseConstraints("absence_reports", t, tenants),
    fk(
      "absence_reports",
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
      "absence_reports",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "absence_reports",
      [t.tenantId, t.reportedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "absence_reports",
      [t.tenantId, t.decidedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "absence_reports",
      [t.tenantId, t.reasonDescriptorId, t.reasonNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk("absence_reports", [t.tenantId, t.fileId], [files.tenantId, files.id]),
    ck(
      "absence_reports",
      "school_year_type",
      sql`school_year_type = 'school_year'`,
    ),
    ck("absence_reports", "span", range.bounded("span")),
    ck(
      "absence_reports",
      "kind",
      sql`kind in ('absent', 'late', 'early') and (kind = 'absent') = (at is null)
        and (kind = 'absent' or upper(span) - lower(span) = 1)`,
    ),
    ck(
      "absence_reports",
      "decision",
      sql`decision in ('pending', 'accepted', 'declined', 'withdrawn')
        and (decision in ('pending', 'withdrawn')) = (decided_at is null)`,
    ),
    ck("absence_reports", "note", sql`char_length(note) between 1 and 1000`),
    ck(
      "absence_reports",
      "decision_note",
      sql`char_length(decision_note) between 1 and 500`,
    ),
    index("absence_reports_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    index("absence_reports_open_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active' and decision = 'pending'`),
    ...entityProfile(),
  ],
);

/**
 * The office trying to reach a family about a child's unexplained absence:
 * the first-day call and those after it, kept for the safeguarding record.
 */
export const attendanceContacts = core.table.withRLS(
  "attendance_contacts",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    dayOn: date("day_on", { mode: "string" }).notNull(),
    outcome: text("outcome").$type<ContactOutcome>().notNull(),
    note: text("note"),
    recordedByUserId: uuid("recorded_by_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("attendance_contacts", t.tenantId, t.id),
    ...baseConstraints("attendance_contacts", t, tenants),
    fk("attendance_contacts", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "attendance_contacts",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "attendance_contacts",
      [t.tenantId, t.recordedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "attendance_contacts",
      "outcome",
      sql`outcome in ('reached', 'no_answer', 'left_message', 'messaged')`,
    ),
    ck("attendance_contacts", "note", sql`char_length(note) between 1 and 500`),
    index("attendance_contacts_day_idx")
      .on(t.tenantId, t.orgId, t.dayOn)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A child arriving late or leaving early through reception: when, why,
 * and for a departure, who collected them. The day's registers take the
 * mark; this keeps the front desk's record, which safeguarding needs.
 */
export const studentMovements = core.table.withRLS(
  "student_movements",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    dayOn: date("day_on", { mode: "string" }).notNull(),
    direction: text("direction").$type<"in" | "out">().notNull(),
    at: time("at").notNull(),
    reasonDescriptorId: uuid("reason_descriptor_id"),
    reasonNs: text("reason_ns")
      .notNull()
      .generatedAlwaysAs(sql`'attendance_reason'`),
    /** A contact on the child's record who collected them. */
    collectedByUserId: uuid("collected_by_user_id"),
    /** Anyone else who collected them, as they gave their name. */
    collectedByName: text("collected_by_name"),
    note: text("note"),
    recordedByUserId: uuid("recorded_by_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("student_movements", t.tenantId, t.id),
    ...baseConstraints("student_movements", t, tenants),
    fk("student_movements", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "student_movements",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "student_movements",
      [t.tenantId, t.reasonDescriptorId, t.reasonNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "student_movements",
      [t.tenantId, t.collectedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "student_movements",
      [t.tenantId, t.recordedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "student_movements",
      "direction",
      sql`direction in ('in', 'out')
        and (direction = 'out' or (collected_by_user_id is null and collected_by_name is null))`,
    ),
    ck(
      "student_movements",
      "collected_by_name",
      sql`char_length(collected_by_name) between 1 and 120`,
    ),
    ck("student_movements", "note", sql`char_length(note) between 1 and 500`),
    index("student_movements_day_idx")
      .on(t.tenantId, t.orgId, t.dayOn)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
