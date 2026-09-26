import type { ManagementOptionsInput } from "@faridalms/domain/administration-schema";
import type {
  RecipientCursor,
  AssignmentsQuery,
  StudentDirectoryQuery,
  StaffDirectoryQuery,
  ClassDirectoryQuery,
  AttendanceRegisterQuery,
  CalendarQuery,
  ClassScopedQuery,
  MessagesQuery,
  NewslettersQuery,
  StudentScopedQuery,
} from "@faridalms/domain/school-schema";

import { queryOptions } from "@tanstack/react-query";

import {
  getAdminOverview,
  getAllClasses,
  getAllStudents,
  getAllUsers,
  getAssignmentDetail,
  getAssignments,
  getAttendance,
  getAttendanceRegister,
  getCalendar,
  getClass,
  getClassAssignments,
  getFamilyOverview,
  getGrades,
  getGradingQueue,
  getManagementOptions,
  getMessage,
  getMessages,
  getMyClasses,
  getNewsletters,
  getRecipients,
  getSchoolSettings,
  getStudent,
  getStudentForManagement,
  getStudentOverview,
  getSubjects,
  getTeachingOverview,
  getTimetable,
  getVisibleStudents,
} from "~/server/school";

export const visibleStudentsQuery = queryOptions({
  queryKey: ["students", "visible"],
  queryFn: () => getVisibleStudents(),
});

export function studentQuery(query: StudentScopedQuery) {
  return queryOptions({
    queryKey: ["students", "detail", query],
    queryFn: () => getStudent({ data: query }),
    placeholderData: (previous) => previous,
  });
}

export const familyOverviewQuery = queryOptions({
  queryKey: ["overview", "family"],
  queryFn: () => getFamilyOverview(),
});

export const studentOverviewQuery = queryOptions({
  queryKey: ["overview", "student"],
  queryFn: () => getStudentOverview(),
});

export const teachingOverviewQuery = queryOptions({
  queryKey: ["overview", "teaching"],
  queryFn: () => getTeachingOverview(),
});

export const adminOverviewQuery = queryOptions({
  queryKey: ["overview", "admin"],
  queryFn: () => getAdminOverview(),
});

export function assignmentsQuery(query: AssignmentsQuery) {
  return queryOptions({
    // The whole query is the key, so every week and child is cached separately
    // and stepping back to a previous week is instant.
    queryKey: ["assignments", query],
    queryFn: () => getAssignments({ data: query }),
    placeholderData: (previous) => previous,
  });
}

export function assignmentDetailQuery(id: string) {
  return queryOptions({
    queryKey: ["assignments", "detail", id],
    queryFn: () => getAssignmentDetail({ data: { id } }),
  });
}

export function classAssignmentsQuery(query: ClassScopedQuery) {
  return queryOptions({
    queryKey: ["assignments", "class", query],
    queryFn: () => getClassAssignments({ data: query }),
    placeholderData: (previous) => previous,
  });
}

export function attendanceQuery(query: StudentScopedQuery) {
  return queryOptions({
    queryKey: ["attendance", query],
    queryFn: () => getAttendance({ data: query }),
    placeholderData: (previous) => previous,
  });
}

export function attendanceRegisterQuery(query: AttendanceRegisterQuery) {
  return queryOptions({
    queryKey: ["attendance", "register", query],
    queryFn: () => getAttendanceRegister({ data: query }),
    placeholderData: (previous) => previous,
  });
}

export function gradesQuery(query: StudentScopedQuery) {
  return queryOptions({
    queryKey: ["grades", query],
    queryFn: () => getGrades({ data: query }),
    placeholderData: (previous) => previous,
  });
}

export function timetableQuery(query: StudentScopedQuery) {
  return queryOptions({
    queryKey: ["timetable", query],
    queryFn: () => getTimetable({ data: query }),
    placeholderData: (previous) => previous,
  });
}

export const myClassesQuery = queryOptions({
  queryKey: ["classes", "mine"],
  queryFn: () => getMyClasses(),
});

export function allClassesQuery(query: ClassDirectoryQuery) {
  return queryOptions({
    queryKey: ["classes", "all", query],
    queryFn: () => getAllClasses({ data: query }),
  });
}

export function classQuery(id: string) {
  return queryOptions({
    queryKey: ["classes", "detail", id],
    queryFn: () => getClass({ data: { id } }),
  });
}

export const gradingQueueQuery = queryOptions({
  queryKey: ["grading", "queue"],
  queryFn: () => getGradingQueue(),
});

export function allStudentsQuery(query: StudentDirectoryQuery) {
  return queryOptions({
    queryKey: ["students", "all", query],
    queryFn: () => getAllStudents({ data: query }),
  });
}

export function studentManagementQuery(id: string) {
  return queryOptions({
    queryKey: ["student-management", id],
    queryFn: () => getStudentForManagement({ data: { id } }),
  });
}

export function managementOptionsQuery(query: ManagementOptionsInput) {
  return queryOptions({
    queryKey: ["management-options", query],
    queryFn: () => getManagementOptions({ data: query }),
  });
}

export function allUsersQuery(query: StaffDirectoryQuery) {
  return queryOptions({
    queryKey: ["users", "all", query],
    queryFn: () => getAllUsers({ data: query }),
  });
}

export const subjectsQuery = queryOptions({
  queryKey: ["subjects"],
  queryFn: () => getSubjects(),
});

export const schoolSettingsQuery = queryOptions({
  queryKey: ["school", "settings"],
  queryFn: () => getSchoolSettings(),
});

export function messagesQuery(query: MessagesQuery) {
  return queryOptions({
    queryKey: ["messages", query],
    queryFn: () => getMessages({ data: query }),
    placeholderData: (previous) => previous,
  });
}

export function messageQuery(id: string) {
  return queryOptions({
    queryKey: ["messages", "detail", id],
    queryFn: () => getMessage({ data: { id } }),
  });
}

export function recipientsQuery(
  category: "teachers" | "administration" | "parents" | "students",
  q = "",
  cursor?: RecipientCursor,
) {
  return queryOptions({
    queryKey: ["messages", "recipients", category, q, cursor],
    queryFn: () => getRecipients({ data: { category, q, cursor } }),
  });
}

export function newslettersQuery(query: NewslettersQuery) {
  return queryOptions({
    queryKey: ["newsletters", query],
    queryFn: () => getNewsletters({ data: query }),
    placeholderData: (previous) => previous,
  });
}

export function calendarQuery(query: CalendarQuery) {
  return queryOptions({
    queryKey: ["calendar", query],
    queryFn: () => getCalendar({ data: query }),
    placeholderData: (previous) => previous,
  });
}
