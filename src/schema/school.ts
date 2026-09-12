import * as v from "valibot";

export const ASSIGNMENT_STATES = [
  "not_started",
  "draft",
  "submitted",
  "returned",
] as const;
export const EVENT_CATEGORIES = [
  "general",
  "national_vacation",
  "school_vacation",
] as const;
export const MESSAGE_FOLDERS = ["inbox", "sent"] as const;
export const MESSAGE_CATEGORIES = ["teachers", "administration"] as const;
export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "late",
  "excused",
] as const;

/**
 * Search-param contracts. Every field is optional with a default, because a
 * bare route with no search must be valid.
 */
export const studentScopedQuerySchema = v.object({
  studentId: v.optional(v.string(), ""),
});
export type StudentScopedQuery = v.InferOutput<typeof studentScopedQuerySchema>;
export const DEFAULT_STUDENT_SCOPED_QUERY: StudentScopedQuery = v.parse(
  studentScopedQuerySchema,
  {},
);

export const assignmentsQuerySchema = v.object({
  studentId: v.optional(v.string(), ""),
  week: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});
export type AssignmentsQuery = v.InferOutput<typeof assignmentsQuerySchema>;
export const DEFAULT_ASSIGNMENTS_QUERY: AssignmentsQuery = v.parse(
  assignmentsQuerySchema,
  {},
);

export const classScopedQuerySchema = v.object({
  classId: v.optional(v.string(), ""),
  week: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});
export type ClassScopedQuery = v.InferOutput<typeof classScopedQuerySchema>;
export const DEFAULT_CLASS_SCOPED_QUERY: ClassScopedQuery = v.parse(
  classScopedQuerySchema,
  {},
);

export const attendanceRegisterQuerySchema = v.object({
  classId: v.optional(v.string(), ""),
  date: v.optional(v.string(), ""),
});
export type AttendanceRegisterQuery = v.InferOutput<
  typeof attendanceRegisterQuerySchema
>;
export const DEFAULT_ATTENDANCE_REGISTER_QUERY: AttendanceRegisterQuery =
  v.parse(attendanceRegisterQuerySchema, {});

export const messagesQuerySchema = v.object({
  folder: v.optional(v.picklist(MESSAGE_FOLDERS), "inbox"),
  q: v.optional(v.string(), ""),
});
export type MessagesQuery = v.InferOutput<typeof messagesQuerySchema>;
export const DEFAULT_MESSAGES_QUERY: MessagesQuery = v.parse(
  messagesQuerySchema,
  {},
);

export const newslettersQuerySchema = v.object({
  q: v.optional(v.string(), ""),
});
export type NewslettersQuery = v.InferOutput<typeof newslettersQuerySchema>;
export const DEFAULT_NEWSLETTERS_QUERY: NewslettersQuery = v.parse(
  newslettersQuerySchema,
  {},
);

export const calendarQuerySchema = v.object({
  /** ISO year-month, e.g. 2026-09. Empty means the month containing today. */
  month: v.optional(v.string(), ""),
  categories: v.optional(v.array(v.picklist(EVENT_CATEGORIES)), []),
});
export type CalendarQuery = v.InferOutput<typeof calendarQuerySchema>;
export const DEFAULT_CALENDAR_QUERY: CalendarQuery = v.parse(
  calendarQuerySchema,
  {},
);

// --- mutations ----------------------------------------------------------------

export const composeMessageSchema = v.object({
  category: v.picklist(MESSAGE_CATEGORIES),
  recipientId: v.pipe(v.string(), v.minLength(1)),
  studentId: v.optional(v.string(), ""),
  subject: v.pipe(v.string(), v.minLength(3), v.maxLength(255)),
  body: v.pipe(v.string(), v.minLength(1)),
});
export type ComposeMessageInput = v.InferInput<typeof composeMessageSchema>;
export type ComposeMessageOutput = v.InferOutput<typeof composeMessageSchema>;

export const submitWorkSchema = v.object({
  assignmentId: v.pipe(v.string(), v.minLength(1)),
});

export const gradeSubmissionSchema = v.object({
  submissionId: v.pipe(v.string(), v.minLength(1)),
  score: v.pipe(v.number(), v.integer(), v.minValue(0)),
  feedback: v.optional(v.string(), ""),
});
export type GradeSubmissionInput = v.InferInput<typeof gradeSubmissionSchema>;

export const recordAttendanceSchema = v.object({
  classId: v.pipe(v.string(), v.minLength(1)),
  date: v.pipe(v.string(), v.minLength(10)),
  entries: v.array(
    v.object({
      studentId: v.pipe(v.string(), v.minLength(1)),
      status: v.picklist(ATTENDANCE_STATUSES),
      note: v.optional(v.string(), ""),
    }),
  ),
});
export type RecordAttendanceInput = v.InferInput<typeof recordAttendanceSchema>;
