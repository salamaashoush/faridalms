import {
  schoolProfileSchema,
  saveSubjectSchema,
  publishNewsletterSchema,
  saveUserSchema,
  saveStudentSchema,
  saveClassSchema,
  managementOptionsSchema,
} from "@faridalms/domain/administration-schema";
import {
  recipientQuerySchema,
  replyMessageSchema,
  staffDirectorySchema,
  classDirectorySchema,
  createAssignmentSchema,
  studentDirectorySchema,
  assignmentsQuerySchema,
  attendanceRegisterQuerySchema,
  calendarEventSchema,
  calendarQuerySchema,
  classScopedQuerySchema,
  composeMessageSchema,
  gradeSubmissionSchema,
  messagesQuerySchema,
  newslettersQuerySchema,
  recordAttendanceSchema,
  studentScopedQuerySchema,
  submitWorkSchema,
} from "@faridalms/domain/school-schema";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";

export const getVisibleStudents = createServerFn({ method: "GET" }).handler(
  () => backend().getVisibleStudents(),
);

export const getStudent = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(studentScopedQuerySchema, input))
  .handler(({ data }) => backend().getStudent(data));

export const getFamilyOverview = createServerFn({ method: "GET" }).handler(() =>
  backend().getFamilyOverview(),
);

export const getStudentOverview = createServerFn({ method: "GET" }).handler(
  () => backend().getStudentOverview(),
);

export const getTeachingOverview = createServerFn({ method: "GET" }).handler(
  () => backend().getTeachingOverview(),
);

export const getMyClasses = createServerFn({ method: "GET" }).handler(() =>
  backend().getMyClasses(),
);

export const getClass = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(v.object({ id: v.string() }), input))
  .handler(({ data }) => backend().getClass(data));

export const getClassAssignments = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(classScopedQuerySchema, input))
  .handler(({ data }) => backend().getClassAssignments(data));

export const getGradingQueue = createServerFn({ method: "GET" }).handler(() =>
  backend().getGradingQueue(),
);

export const submitGrade = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(gradeSubmissionSchema, input))
  .handler(({ data }) => backend().submitGrade(data));

export const getAttendanceRegister = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(attendanceRegisterQuerySchema, input))
  .handler(({ data }) => backend().getAttendanceRegister(data));

export const saveAttendance = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(recordAttendanceSchema, input))
  .handler(({ data }) => backend().saveAttendance(data));

export const getAdminOverview = createServerFn({ method: "GET" }).handler(() =>
  backend().getAdminOverview(),
);

export const getAllStudents = createServerFn({ method: "GET" })
  .validator((input: v.InferInput<typeof studentDirectorySchema>) =>
    v.parse(studentDirectorySchema, input),
  )
  .handler(({ data }) => backend().getAllStudents(data));

export const getAllUsers = createServerFn({ method: "GET" })
  .validator((input: v.InferInput<typeof staffDirectorySchema>) =>
    v.parse(staffDirectorySchema, input),
  )
  .handler(({ data }) => backend().getAllUsers(data));

export const getAllClasses = createServerFn({ method: "GET" })
  .validator((input: v.InferInput<typeof classDirectorySchema>) =>
    v.parse(classDirectorySchema, input),
  )
  .handler(({ data }) => backend().getAllClasses(data));

export const getSubjects = createServerFn({ method: "GET" }).handler(() =>
  backend().getSubjects(),
);

export const getSchoolSettings = createServerFn({ method: "GET" }).handler(() =>
  backend().getSchoolSettings(),
);

export const getAssignments = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(assignmentsQuerySchema, input))
  .handler(({ data }) => backend().getAssignments(data));

export const getAssignmentDetail = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(v.object({ id: v.string() }), input))
  .handler(({ data }) => backend().getAssignmentDetail(data));

export const submitAssignment = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(submitWorkSchema, input))
  .handler(({ data }) => backend().submitAssignment(data));

export const getAttendance = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(studentScopedQuerySchema, input))
  .handler(({ data }) => backend().getAttendance(data));

export const getGrades = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(studentScopedQuerySchema, input))
  .handler(({ data }) => backend().getGrades(data));

export const getTimetable = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(studentScopedQuerySchema, input))
  .handler(({ data }) => backend().getTimetable(data));

export const getMessages = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(messagesQuerySchema, input))
  .handler(({ data }) => backend().getMessages(data));

export const getMessage = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(v.object({ id: v.string() }), input))
  .handler(({ data }) => backend().getMessage(data));

export const getRecipients = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(recipientQuerySchema, input))
  .handler(({ data }) => backend().getRecipients(data));

export const sendMessage = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(composeMessageSchema, input))
  .handler(({ data }) => backend().sendMessage(data));

export const getNewsletters = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(newslettersQuerySchema, input))
  .handler(({ data }) => backend().getNewsletters(data));

export const getCalendar = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(calendarQuerySchema, input))
  .handler(({ data }) => backend().getCalendar(data));

export const createAssignment = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof createAssignmentSchema>) =>
    v.parse(createAssignmentSchema, input),
  )
  .handler(({ data }) => backend().createAssignment(data));

export const saveCalendarEvent = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(calendarEventSchema, input))
  .handler(({ data }) => backend().saveCalendarEvent(data));

export const saveUser = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(saveUserSchema, input))
  .handler(({ data }) => backend().saveUser(data));

export const saveStudent = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(saveStudentSchema, input))
  .handler(({ data }) => backend().saveStudent(data));

export const saveClass = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(saveClassSchema, input))
  .handler(({ data }) => backend().saveClass(data));

export const getManagementOptions = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(managementOptionsSchema, input))
  .handler(({ data }) => backend().getManagementOptions(data));

export const getStudentForManagement = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    v.parse(v.object({ id: v.pipe(v.string(), v.uuid()) }), input),
  )
  .handler(({ data }) => backend().getStudentForManagement(data));

export const saveSchoolProfile = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(schoolProfileSchema, input))
  .handler(({ data }) => backend().saveSchoolProfile(data));

export const saveSubject = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(saveSubjectSchema, input))
  .handler(({ data }) => backend().saveSubject(data));

export const publishNewsletter = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(publishNewsletterSchema, input))
  .handler(({ data }) => backend().publishNewsletter(data));

export const replyMessage = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(replyMessageSchema, input))
  .handler(({ data }) => backend().replyMessage(data));
