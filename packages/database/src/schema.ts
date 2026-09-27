import type { RubricCriterion } from "@faridalms/domain/assignment";
import type { ContentDocument } from "@faridalms/domain/content";
import type { NewsletterDocument } from "@faridalms/domain/newsletter";

import { SCHOOL_YEAR_STATUSES } from "@faridalms/domain/academic-year";
import {
  ASSIGNMENT_STATUSES,
  LATE_POLICIES,
  RECIPIENT_MODES,
  RESUBMISSION_POLICIES,
  SUBMISSION_FORMATS,
} from "@faridalms/domain/assignment";
import { FILE_STATES } from "@faridalms/domain/file";
import { PERMISSIONS } from "@faridalms/domain/identity";
import { ANNOUNCEMENT_AUDIENCES } from "@faridalms/domain/notification";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Enumerations are database types, not application constants, so an invalid
// role or status cannot be written by any client -- including psql.

export const roleEnum = pgEnum("role", [
  "admin",
  "teacher",
  "parent",
  "student",
]);
export const stageEnum = pgEnum("stage", ["early_years", "primary", "middle"]);
export const assignmentTypeEnum = pgEnum("assignment_type", [
  "written_assignment",
  "project",
  "reading",
  "quiz",
  "presentation",
]);
export const submissionStateEnum = pgEnum("submission_state", [
  "not_started",
  "draft",
  "submitted",
  "returned",
]);
export const assignmentStatusEnum = pgEnum(
  "assignment_status",
  ASSIGNMENT_STATUSES,
);
export const submissionFormatEnum = pgEnum(
  "submission_format",
  SUBMISSION_FORMATS,
);
export const latePolicyEnum = pgEnum("late_policy", LATE_POLICIES);
export const resubmissionPolicyEnum = pgEnum(
  "resubmission_policy",
  RESUBMISSION_POLICIES,
);
export const recipientModeEnum = pgEnum("recipient_mode", RECIPIENT_MODES);
export const filePurposeEnum = pgEnum("file_purpose", [
  "assignment_resource",
  "submission_attachment",
  "message_attachment",
  "site_media",
  "lesson_media",
]);
export const fileStateEnum = pgEnum("file_state", FILE_STATES);
export const schoolYearStatusEnum = pgEnum(
  "school_year_status",
  SCHOOL_YEAR_STATUSES,
);
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "late",
  "excused",
]);
export const bloodGroupEnum = pgEnum("blood_group", [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
]);
export const messageCategoryEnum = pgEnum("message_category", [
  "teachers",
  "administration",
  "parents",
  "students",
]);
export const eventCategoryEnum = pgEnum("event_category", [
  "general",
  "national_vacation",
  "school_vacation",
]);
export const guardianRelationEnum = pgEnum("guardian_relation", [
  "father",
  "mother",
  "guardian",
  "other",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

// --- academic structure -------------------------------------------------------

export const schoolYears = pgTable(
  "school_years",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar({ length: 16 }).notNull().unique(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    // Existing years were all open before the lifecycle existed; new years
    // are inserted as planning by the registry.
    status: schoolYearStatusEnum().notNull().default("active"),
    revision: integer().notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("school_years_one_current_idx")
      .on(table.isCurrent)
      .where(sql`${table.isCurrent} = true`),
    check(
      "school_years_default_active_check",
      sql`not ${table.isCurrent} or ${table.status} = 'active'`,
    ),
    check(
      "school_years_dates_check",
      sql`${table.startsOn} <= ${table.endsOn}`,
    ),
    check("school_years_revision_check", sql`${table.revision} > 0`),
  ],
);

/** Every lifecycle change of a year, who made it and, for a reopening, why. */
export const schoolYearEvents = pgTable(
  "school_year_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    action: varchar({ length: 32 }).notNull(),
    reason: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("school_year_events_year_idx").on(
      table.schoolYearId,
      table.createdAt,
    ),
  ],
);

export const subjects = pgTable("subjects", {
  id: uuid().primaryKey().defaultRandom(),
  slug: varchar({ length: 48 }).notNull().unique(),
  name: varchar({ length: 128 }).notNull(),
  nameAr: varchar("name_ar", { length: 128 }).notNull(),
  icon: varchar({ length: 32 }).notNull().default("book-open"),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: varchar({ length: 255 }).notNull(),
    // Argon2id/bcrypt digest. Never a plaintext password, in any environment.
    passwordHash: text("password_hash").notNull(),
    name: varchar({ length: 128 }).notNull(),
    role: roleEnum().notNull(),
    title: varchar({ length: 128 }),
    mobile: varchar({ length: 32 }),
    avatarUrl: text("avatar_url"),
    isActive: boolean("is_active").notNull().default(true),
    lastSignedInAt: timestamp("last_signed_in_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    // Citext would be tidier, but a lowercase functional index keeps the schema
    // to core types while still making "Parent@..." and "parent@..." one account.
    uniqueIndex("users_email_lower_idx").on(sql`lower(${table.email})`),
    index("users_role_idx").on(table.role),
    index("users_recipient_directory_idx").on(
      table.role,
      table.isActive,
      table.name,
      table.id,
    ),
  ],
);

export const classes = pgTable(
  "classes",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "restrict" }),
    name: varchar({ length: 32 }).notNull(),
    grade: varchar({ length: 16 }).notNull(),
    stage: stageEnum().notNull(),
    room: varchar({ length: 32 }),
    homeroomTeacherId: uuid("homeroom_teacher_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revision: integer().notNull().default(1),
    ...timestamps,
  },
  (table) => [
    unique("classes_year_name_key").on(table.schoolYearId, table.name),
    index("classes_teacher_idx").on(table.homeroomTeacherId),
    check("classes_revision_check", sql`${table.revision} > 0`),
  ],
);

export const students = pgTable(
  "students",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Human-facing identifier printed on cards and reports.
    reference: varchar({ length: 24 }).notNull().unique(),
    firstName: varchar("first_name", { length: 64 }).notNull(),
    lastName: varchar("last_name", { length: 64 }).notNull(),
    // Nullable on purpose: the school genuinely does not always hold one, and
    // the UI must be able to say "not recorded" rather than render a blank.
    birthdate: date(),
    photoUrl: text("photo_url"),
    // Set when a student has their own sign-in. Not every child does.
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [index("students_name_idx").on(table.lastName, table.firstName)],
);

export const studentContacts = pgTable("student_contacts", {
  studentId: uuid("student_id")
    .primaryKey()
    .references(() => students.id, { onDelete: "cascade" }),
  email: varchar({ length: 255 }),
  fatherMobile: varchar("father_mobile", { length: 32 }),
  motherMobile: varchar("mother_mobile", { length: 32 }),
  contactMobile: varchar("contact_mobile", { length: 32 }),
  fatherAddress: text("father_address"),
  motherAddress: text("mother_address"),
  ...timestamps,
});

export const emergencyContacts = pgTable(
  "emergency_contacts",
  {
    id: uuid().primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    name: varchar({ length: 128 }).notNull(),
    mobile: varchar({ length: 32 }).notNull(),
    relation: varchar({ length: 64 }).notNull(),
    priority: smallint().notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("emergency_student_idx").on(table.studentId, table.priority),
  ],
);

export const studentMedical = pgTable("student_medical", {
  studentId: uuid("student_id")
    .primaryKey()
    .references(() => students.id, { onDelete: "cascade" }),
  bloodGroup: bloodGroupEnum("blood_group"),
  allergies: text(),
  pastInjuries: text("past_injuries"),
  surgeries: text(),
  medicineAgreement: boolean("medicine_agreement").notNull().default(false),
  ...timestamps,
});

export const medicalReports = pgTable(
  "medical_reports",
  {
    id: uuid().primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    name: varchar({ length: 255 }).notNull(),
    url: text().notNull(),
    uploadedOn: date("uploaded_on").notNull(),
    ...timestamps,
  },
  (table) => [index("medical_reports_student_idx").on(table.studentId)],
);

/** Which adults may see which child, and in what capacity. */
export const guardianships = pgTable(
  "guardianships",
  {
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    relation: guardianRelationEnum().notNull().default("guardian"),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.guardianId, table.studentId] }),
    index("guardianships_student_idx").on(table.studentId),
  ],
);

export const enrolments = pgTable(
  "enrolments",
  {
    id: uuid().primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    since: date().notNull(),
    until: date(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("enrolments_open_student_class_idx")
      .on(table.studentId, table.classId)
      .where(sql`${table.until} is null`),
    check(
      "enrolments_dates_check",
      sql`${table.until} is null or ${table.since} <= ${table.until}`,
    ),
    index("enrolments_class_idx").on(table.classId),
  ],
);

/** Subjects taught to a class, and by whom. */
export const classSubjects = pgTable(
  "class_subjects",
  {
    id: uuid().primaryKey().defaultRandom(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    teacherId: uuid("teacher_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [unique("class_subjects_key").on(table.classId, table.subjectId)],
);

// --- private files ------------------------------------------------------------

/**
 * A stored object and the facts the server verified about it. Knowing an id
 * never grants a download: every read re-checks the record the file is linked
 * to, and the storage key is generated here rather than accepted from a client.
 */
export const privateFiles = pgTable(
  "private_files",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: filePurposeEnum().notNull(),
    name: varchar({ length: 255 }).notNull(),
    mediaType: varchar("media_type", { length: 128 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: varchar({ length: 64 }),
    state: fileStateEnum().notNull().default("initiated"),
    storageKey: text("storage_key").notNull().unique(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    rejectionReason: varchar("rejection_reason", { length: 32 }),
    // Null when no scanner was configured at upload time.
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("private_files_owner_idx").on(table.ownerId, table.state),
    index("private_files_state_idx").on(table.state, table.updatedAt),
    check("private_files_size_check", sql`${table.sizeBytes} > 0`),
  ],
);

// --- teaching and learning ----------------------------------------------------

export const terms = pgTable(
  "terms",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    name: varchar({ length: 32 }).notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("terms_year_name_key").on(table.schoolYearId, table.name),
    check("terms_dates_check", sql`${table.startsOn} <= ${table.endsOn}`),
  ],
);

export const academicWeeks = pgTable(
  "academic_weeks",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "academic_weeks_dates_check",
      sql`${table.startsOn} <= ${table.endsOn}`,
    ),
    check("academic_weeks_number_check", sql`${table.number} > 0`),
    unique("academic_weeks_year_number_key").on(
      table.schoolYearId,
      table.number,
    ),
  ],
);

export const assignments = pgTable(
  "assignments",
  {
    id: uuid().primaryKey().defaultRandom(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    weekId: uuid("week_id").references(() => academicWeeks.id, {
      onDelete: "set null",
    }),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: varchar({ length: 255 }).notNull(),
    // Plain-text brief kept for records written before the shared editor.
    description: text(),
    instructions: jsonb().$type<ContentDocument>(),
    type: assignmentTypeEnum().notNull(),
    status: assignmentStatusEnum().notNull().default("published"),
    // A class audience follows the roster, so students who join later see the
    // work; groups and named students are fixed when saved. Recipient rows
    // record who was reached and keep anyone who has already handed in.
    audience: recipientModeEnum().notNull().default("class"),
    revision: integer().notNull().default(1),
    assignedOn: date("assigned_on").notNull(),
    // The school-local calendar day of `dueAt`, kept for week grouping and lists.
    dueDate: date("due_date").notNull(),
    availableFrom: timestamp("available_from", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    latePolicy: latePolicyEnum("late_policy").notNull().default("not_accepted"),
    lateDeductionPercent: smallint("late_deduction_percent")
      .notNull()
      .default(0),
    submissionFormat: submissionFormatEnum("submission_format")
      .notNull()
      .default("written"),
    maxAttachments: smallint("max_attachments").notNull().default(0),
    maxAttachmentBytes: integer("max_attachment_bytes")
      .notNull()
      .default(10 * 1024 * 1024),
    resubmission: resubmissionPolicyEnum().notNull().default("not_allowed"),
    maxScore: integer("max_score").notNull().default(10),
    rubric: jsonb().$type<RubricCriterion[]>().notNull().default([]),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    updatedById: uuid("updated_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    index("assignments_class_due_idx").on(table.classId, table.dueDate),
    index("assignments_week_idx").on(table.weekId),
    index("assignments_status_idx").on(table.status, table.dueAt),
    check("assignments_revision_check", sql`${table.revision} > 0`),
    check(
      "assignments_deduction_check",
      sql`${table.lateDeductionPercent} between 0 and 100`,
    ),
    check(
      "assignments_attachments_check",
      sql`${table.maxAttachments} between 0 and 10`,
    ),
  ],
);

/**
 * The audience resolved when a teacher chose it. A roster change later does
 * not silently remove work; publishing to new students adds rows.
 */
export const assignmentRecipients = pgTable(
  "assignment_recipients",
  {
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    source: varchar({ length: 16 }).notNull().default("class"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.assignmentId, table.studentId] }),
    index("assignment_recipients_student_idx").on(table.studentId),
  ],
);

/**
 * One aggregate per student per assignment. The mutable draft lives here; each
 * hand-in becomes an immutable attempt, and the score columns mirror the
 * released assessment of `currentAttemptId` so lists never join three tables.
 */
export const submissions = pgTable(
  "submissions",
  {
    id: uuid().primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    state: submissionStateEnum().notNull().default("not_started"),
    revision: integer().notNull().default(1),
    draft: jsonb().$type<ContentDocument>(),
    currentAttemptId: uuid("current_attempt_id"),
    content: text(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    score: integer(),
    feedback: text(),
    gradedById: uuid("graded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("submissions_assignment_student_key").on(
      table.assignmentId,
      table.studentId,
    ),
    index("submissions_student_idx").on(table.studentId),
    check("submissions_revision_check", sql`${table.revision} > 0`),
  ],
);

/** A hand-in as it was at the moment of submission. Never updated afterwards. */
export const submissionAttempts = pgTable(
  "submission_attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    number: smallint().notNull(),
    // The draft revision this attempt was cut from, so a retried submit of the
    // same revision finds this row instead of creating a second attempt.
    sourceRevision: integer("source_revision").notNull(),
    content: jsonb().$type<ContentDocument>(),
    plainText: text("plain_text"),
    isLate: boolean("is_late").notNull().default(false),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedById: uuid("submitted_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    unique("submission_attempts_number_key").on(
      table.submissionId,
      table.number,
    ),
    unique("submission_attempts_revision_key").on(
      table.submissionId,
      table.sourceRevision,
    ),
    check("submission_attempts_number_check", sql`${table.number} > 0`),
  ],
);

export interface RubricScore {
  criterionId: string;
  points: number;
  comment: string;
}

/** Score and feedback for one attempt. Draft until `releasedAt` is set. */
export const assessments = pgTable(
  "assessments",
  {
    id: uuid().primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .unique()
      .references(() => submissionAttempts.id, { onDelete: "cascade" }),
    score: integer().notNull(),
    effectiveScore: integer("effective_score").notNull(),
    rubricScores: jsonb("rubric_scores")
      .$type<RubricScore[]>()
      .notNull()
      .default([]),
    feedback: jsonb().$type<ContentDocument>(),
    feedbackText: text("feedback_text"),
    gradedById: uuid("graded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    gradedAt: timestamp("graded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    revision: integer().notNull().default(1),
  },
  (table) => [check("assessments_revision_check", sql`${table.revision} > 0`)],
);

export const grades = pgTable(
  "grades",
  {
    id: uuid().primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    score: integer().notNull(),
    maxScore: integer("max_score").notNull().default(100),
    comment: text(),
    teacherId: uuid("teacher_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    unique("grades_student_subject_term_key").on(
      table.studentId,
      table.subjectId,
      table.termId,
    ),
  ],
);

export const attendance = pgTable(
  "attendance",
  {
    id: uuid().primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    date: date().notNull(),
    status: attendanceStatusEnum().notNull(),
    revision: integer().notNull().default(1),
    note: text(),
    recordedById: uuid("recorded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    // One mark per student per day. Re-taking the register updates it.
    unique("attendance_student_date_key").on(table.studentId, table.date),
    check("attendance_revision_check", sql`${table.revision} > 0`),
    index("attendance_class_date_idx").on(table.classId, table.date),
  ],
);

export const timetableSlots = pgTable(
  "timetable_slots",
  {
    id: uuid().primaryKey().defaultRandom(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    teacherId: uuid("teacher_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // 0 = Sunday, matching the Egyptian school week.
    weekday: smallint().notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    room: varchar({ length: 32 }),
    ...timestamps,
  },
  (table) => [
    unique("timetable_class_slot_key").on(
      table.classId,
      table.weekday,
      table.startTime,
    ),
    index("timetable_teacher_idx").on(table.teacherId, table.weekday),
  ],
);

// --- communication ------------------------------------------------------------

export const messageBodyFormatEnum = pgEnum("message_body_format", [
  "plain",
  "markdown",
  "rich",
]);

export const messages = pgTable(
  "messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: messageCategoryEnum().notNull(),
    // The child the conversation is about. Optional: school-wide notices are
    // not about any one student.
    studentId: uuid("student_id").references(() => students.id, {
      onDelete: "set null",
    }),
    parentMessageId: uuid("parent_message_id"),
    subject: varchar({ length: 255 }).notNull(),
    // The plain text of the message; for rich messages it is derived from the
    // document so search, previews and older clients keep working.
    body: text().notNull(),
    bodyFormat: messageBodyFormatEnum("body_format").notNull().default("plain"),
    document: jsonb().$type<ContentDocument>(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    index("messages_sender_idx").on(table.senderId, table.sentAt),
    index("messages_thread_idx").on(table.parentMessageId),
  ],
);

export const messageDrafts = pgTable(
  "message_drafts",
  {
    id: uuid().primaryKey(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: messageCategoryEnum().notNull(),
    recipientId: uuid("recipient_id").references(() => users.id, {
      onDelete: "set null",
    }),
    studentId: uuid("student_id").references(() => students.id, {
      onDelete: "set null",
    }),
    subject: varchar({ length: 255 }).notNull(),
    body: text().notNull(),
    bodyFormat: messageBodyFormatEnum("body_format").notNull(),
    document: jsonb().$type<ContentDocument>(),
    revision: integer().notNull().default(1),
    sentMessageId: uuid("sent_message_id").references(() => messages.id),
    ...timestamps,
  },
  (table) => [
    check("message_drafts_revision_check", sql`${table.revision} > 0`),
    index("message_drafts_author_updated_idx")
      .on(table.authorId, table.updatedAt, table.id)
      .where(sql`${table.sentMessageId} is null`),
  ],
);

/**
 * Delivery is its own table so one message can reach several people and each
 * of them has their own read state. A `read` column on `messages` would make
 * one recipient opening it mark it read for everybody.
 */
export const messageRecipients = pgTable(
  "message_recipients",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.recipientId] }),
    index("message_recipients_unread_idx").on(table.recipientId, table.readAt),
  ],
);

export const messageAttachments = pgTable(
  "message_attachments",
  {
    id: uuid().primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    name: varchar({ length: 255 }).notNull(),
    // Records written before the private file lifecycle kept a URL. New
    // attachments point at a verified private file and download through it.
    url: text(),
    fileId: uuid("file_id").references(() => privateFiles.id, {
      onDelete: "restrict",
    }),
    sizeBytes: integer("size_bytes").notNull(),
    ...timestamps,
  },
  (table) => [
    index("message_attachments_message_idx").on(table.messageId),
    index("message_attachments_file_idx").on(table.fileId),
  ],
);

export const messageDraftFiles = pgTable(
  "message_draft_files",
  {
    draftId: uuid("draft_id")
      .notNull()
      .references(() => messageDrafts.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => privateFiles.id, { onDelete: "restrict" }),
    position: smallint().notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.draftId, table.fileId] }),
    index("message_draft_files_file_idx").on(table.fileId),
  ],
);

export const newsletters = pgTable(
  "newsletters",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    title: varchar({ length: 255 }).notNull(),
    summary: text(),
    // Older editions link to an external file; editions published from a
    // draft keep an immutable copy of the document instead.
    url: text(),
    document: jsonb().$type<NewsletterDocument>(),
    draftId: uuid("draft_id"),
    publishedOn: date("published_on").notNull(),
    ...timestamps,
  },
  (table) => [index("newsletters_published_idx").on(table.publishedOn)],
);

export const announcementAudienceEnum = pgEnum(
  "announcement_audience",
  ANNOUNCEMENT_AUDIENCES,
);
export const announcementStatusEnum = pgEnum("announcement_status", [
  "draft",
  "published",
]);

export const announcements = pgTable(
  "announcements",
  {
    id: uuid().primaryKey(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    title: varchar({ length: 255 }).notNull(),
    document: jsonb().$type<ContentDocument>().notNull(),
    summary: text().notNull(),
    audience: announcementAudienceEnum().notNull().default("everyone"),
    status: announcementStatusEnum().notNull().default("draft"),
    revision: integer().notNull().default(1),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("announcements_status_idx").on(table.status, table.publishedAt),
    check("announcements_revision_check", sql`${table.revision} > 0`),
  ],
);

// --- notifications ------------------------------------------------------------

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    revision: integer().notNull().default(0),
    title: varchar({ length: 255 }).notNull(),
    // Plain text derived from the document; search, previews and older clients read it.
    description: text(),
    document: jsonb().$type<ContentDocument>(),
    category: eventCategoryEnum().notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    // The school marks unconfirmed dates "TBC". A flag keeps that out of the
    // title, where it could be neither filtered nor translated.
    provisional: boolean().notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index("calendar_events_range_idx").on(table.startsOn, table.endsOn),
  ],
);

export const permissionEnum = pgEnum("permission", PERMISSIONS);
export const accessRoles = pgTable("access_roles", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 128 }).notNull(),
  baseRole: roleEnum("base_role").notNull(),
  builtinRole: roleEnum("builtin_role").unique(),
  permissions: permissionEnum().array().notNull(),
  revision: integer().notNull().default(1),
  ...timestamps,
});
export const userAccessRoles = pgTable(
  "user_access_roles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    accessRoleId: uuid("access_role_id")
      .notNull()
      .references(() => accessRoles.id),
    revision: integer().notNull().default(1),
    ...timestamps,
  },
  (table) => [index("user_access_roles_role_idx").on(table.accessRoleId)],
);
export const accessChanges = pgTable(
  "access_changes",
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    action: varchar({ length: 64 }).notNull(),
    targetId: text("target_id").notNull(),
    before: jsonb().$type<Record<string, unknown>>(),
    after: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("access_changes_created_idx").on(table.createdAt)],
);
