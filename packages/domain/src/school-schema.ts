import * as v from "valibot";

import { contentDocumentSchema, contentPlainText } from "./content";
import { MESSAGE_ATTACHMENT_LIMIT } from "./file";

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
export const MESSAGE_CATEGORIES = [
  "teachers",
  "administration",
  "parents",
  "students",
] as const;
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
  status: v.optional(
    v.picklist(["all", "draft", "published", "archived"]),
    "all",
  ),
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
  page: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10000)),
    1,
  ),
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
  page: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10000)),
    1,
  ),
  sort: v.optional(v.picklist(["title", "date"]), "date"),
  dir: v.optional(v.picklist(["asc", "desc"]), "desc"),
});
export type NewslettersQuery = v.InferOutput<typeof newslettersQuerySchema>;
export const DEFAULT_NEWSLETTERS_QUERY: NewslettersQuery = v.parse(
  newslettersQuerySchema,
  {},
);

export const calendarQuerySchema = v.object({
  q: v.optional(v.pipe(v.string(), v.maxLength(200)), ""),
  showEvents: v.optional(v.boolean(), true),
  /** ISO year-month, e.g. 2026-09. Empty means the month containing today. */
  month: v.optional(
    v.union([
      v.literal(""),
      v.pipe(v.string(), v.regex(/^\d{4}-(0[1-9]|1[0-2])$/)),
    ]),
    "",
  ),
  date: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.isoDate())]),
    "",
  ),
  view: v.optional(v.picklist(["month", "week", "agenda"]), "month"),
  event: v.optional(v.string(), ""),
  categories: v.optional(v.array(v.picklist(EVENT_CATEGORIES)), []),
});
export type CalendarQuery = v.InferOutput<typeof calendarQuerySchema>;
export const DEFAULT_CALENDAR_QUERY: CalendarQuery = v.parse(
  calendarQuerySchema,
  {},
);

// --- mutations ----------------------------------------------------------------

export const MESSAGE_BODY_FORMATS = ["plain", "markdown", "rich"] as const;
export type MessageBodyFormat = (typeof MESSAGE_BODY_FORMATS)[number];
export const messageBodyFormatSchema = v.optional(
  v.picklist(MESSAGE_BODY_FORMATS),
  "plain",
);
export const messageDocumentSchema = v.optional(
  v.nullable(contentDocumentSchema),
  null,
);
export const messageFileIdsSchema = v.optional(
  v.pipe(
    v.array(v.pipe(v.string(), v.uuid())),
    v.maxLength(MESSAGE_ATTACHMENT_LIMIT),
  ),
  [],
);

/** Rich messages carry their text in the document; the body is derived from it on the server. */
export function messageHasText(value: {
  bodyFormat: MessageBodyFormat;
  body: string;
  document: { root: { type: string } } | null;
}): boolean {
  if (value.bodyFormat === "rich")
    return Boolean(
      value.document &&
      contentPlainText(
        value.document as Parameters<typeof contentPlainText>[0],
      ).trim().length > 0,
    );
  return value.body.trim().length > 0;
}

const messageBody = v.pipe(v.string(), v.trim(), v.maxLength(20000));

export const composeMessageSchema = v.pipe(
  v.object({
    category: v.picklist(MESSAGE_CATEGORIES),
    recipientId: v.pipe(v.string(), v.minLength(1)),
    studentId: v.optional(v.string(), ""),
    subject: v.pipe(v.string(), v.trim(), v.minLength(3), v.maxLength(255)),
    body: messageBody,
    bodyFormat: messageBodyFormatSchema,
    document: messageDocumentSchema,
    fileIds: messageFileIdsSchema,
  }),
  v.forward(
    v.check((value) => messageHasText(value), "validation.message_body"),
    ["body"],
  ),
);
export type ComposeMessageInput = v.InferInput<typeof composeMessageSchema>;
export type ComposeMessageOutput = v.InferOutput<typeof composeMessageSchema>;

export const submitWorkSchema = v.object({
  content: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(20000)),
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
  date: v.pipe(v.string(), v.isoDate()),
  entries: v.pipe(
    v.array(
      v.object({
        studentId: v.pipe(v.string(), v.minLength(1)),
        status: v.picklist(ATTENDANCE_STATUSES),
        expectedRevision: v.optional(
          v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
          null,
        ),
        note: v.optional(v.string(), ""),
      }),
    ),
    v.maxLength(500),
    v.check(
      (entries) =>
        new Set(entries.map((entry) => entry.studentId)).size ===
        entries.length,
    ),
  ),
});
export type RecordAttendanceInput = v.InferInput<typeof recordAttendanceSchema>;

/** An explicit working year, or empty for the school's default year. */
export const workingYearSchema = v.optional(
  v.union([v.literal(""), v.pipe(v.string(), v.uuid())]),
  "",
);

export const studentDirectorySchema = v.object({
  year: workingYearSchema,
  q: v.optional(v.pipe(v.string(), v.maxLength(200)), ""),
  sort: v.optional(
    v.picklist(["name", "reference", "grade", "class", "homeroom"]),
    "name",
  ),
  dir: v.optional(v.picklist(["asc", "desc"]), "asc"),
  page: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10000)),
    1,
  ),
  pageSize: v.optional(v.picklist([25, 50, 100]), 25),
});
export type StudentDirectoryQuery = v.InferOutput<
  typeof studentDirectorySchema
>;

export const createAssignmentSchema = v.pipe(
  v.object({
    classId: v.pipe(v.string(), v.uuid()),
    subjectId: v.pipe(v.string(), v.uuid()),
    title: v.pipe(v.string(), v.trim(), v.minLength(3), v.maxLength(255)),
    description: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1),
      v.maxLength(20000),
    ),
    dueDate: v.pipe(v.string(), v.isoDate()),
    maxScore: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000)),
  }),
  v.check((input) => Number.isFinite(Date.parse(input.dueDate))),
);

export const classDirectorySchema = v.object({
  year: workingYearSchema,
  sort: v.optional(v.picklist(["name", "grade", "room"]), "name"),
  dir: studentDirectorySchema.entries.dir,
  classId: v.optional(v.string(), ""),
  q: studentDirectorySchema.entries.q,
  page: studentDirectorySchema.entries.page,
  pageSize: v.optional(v.picklist([12, 24, 48]), 12),
});
export type ClassDirectoryQuery = v.InferOutput<typeof classDirectorySchema>;

const calendarEventFields = {
  id: v.optional(v.pipe(v.string(), v.uuid())),
  expectedRevision: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(255)),
  /** Plain text, kept for clients without the editor; the document wins when both arrive. */
  description: v.optional(v.pipe(v.string(), v.maxLength(20000)), ""),
  category: v.picklist(EVENT_CATEGORIES),
  startsOn: v.pipe(v.string(), v.isoDate()),
  endsOn: v.pipe(v.string(), v.isoDate()),
  provisional: v.boolean(),
};

/** The editable fields alone; the form keeps the rich document outside its state. */
export const calendarEventFormSchema = v.pipe(
  v.object(calendarEventFields),
  v.forward(
    v.check((value) => value.endsOn >= value.startsOn, "validation.end_date"),
    ["endsOn"],
  ),
);

export const calendarEventSchema = v.pipe(
  v.object({
    ...calendarEventFields,
    document: v.optional(contentDocumentSchema),
  }),
  v.forward(
    v.check((value) => value.endsOn >= value.startsOn, "validation.end_date"),
    ["endsOn"],
  ),
);
export type CalendarEventInput = v.InferInput<typeof calendarEventSchema>;

export const recipientCursorSchema = v.object({
  name: v.pipe(v.string(), v.maxLength(255)),
  id: v.pipe(v.string(), v.uuid()),
});
export type RecipientCursor = v.InferOutput<typeof recipientCursorSchema>;

export const recipientQuerySchema = v.object({
  cursor: v.optional(recipientCursorSchema),
  category: v.picklist(MESSAGE_CATEGORIES),
  q: v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
});
export const replyMessageSchema = v.pipe(
  v.object({
    bodyFormat: messageBodyFormatSchema,
    id: v.pipe(v.string(), v.uuid()),
    body: messageBody,
    document: messageDocumentSchema,
    fileIds: messageFileIdsSchema,
  }),
  v.forward(
    v.check((value) => messageHasText(value), "validation.message_body"),
    ["body"],
  ),
);
export type ReplyMessageInput = v.InferInput<typeof replyMessageSchema>;
