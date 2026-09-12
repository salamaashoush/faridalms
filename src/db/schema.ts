import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
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

export const schoolYears = pgTable("school_years", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 16 }).notNull().unique(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
  ...timestamps,
});

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
    ...timestamps,
  },
  (table) => [
    unique("classes_year_name_key").on(table.schoolYearId, table.name),
    index("classes_teacher_idx").on(table.homeroomTeacherId),
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
    unique("enrolments_student_class_key").on(table.studentId, table.classId),
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
  (table) => [unique("terms_year_name_key").on(table.schoolYearId, table.name)],
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
    description: text(),
    type: assignmentTypeEnum().notNull(),
    assignedOn: date("assigned_on").notNull(),
    dueDate: date("due_date").notNull(),
    maxScore: integer("max_score").notNull().default(10),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("assignments_class_due_idx").on(table.classId, table.dueDate),
    index("assignments_week_idx").on(table.weekId),
  ],
);

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
    // One submission row per student per assignment; re-submitting updates it.
    unique("submissions_assignment_student_key").on(
      table.assignmentId,
      table.studentId,
    ),
    index("submissions_student_idx").on(table.studentId),
  ],
);

export const submissionFiles = pgTable(
  "submission_files",
  {
    id: uuid().primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    name: varchar({ length: 255 }).notNull(),
    url: text().notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    ...timestamps,
  },
  (table) => [index("submission_files_submission_idx").on(table.submissionId)],
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
    note: text(),
    recordedById: uuid("recorded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    // One mark per student per day. Re-taking the register updates it.
    unique("attendance_student_date_key").on(table.studentId, table.date),
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
    body: text().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    index("messages_sender_idx").on(table.senderId, table.sentAt),
    index("messages_thread_idx").on(table.parentMessageId),
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
    url: text().notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    ...timestamps,
  },
  (table) => [index("message_attachments_message_idx").on(table.messageId)],
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
    url: text().notNull(),
    publishedOn: date("published_on").notNull(),
    ...timestamps,
  },
  (table) => [index("newsletters_published_idx").on(table.publishedOn)],
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    title: varchar({ length: 255 }).notNull(),
    description: text(),
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
