import type {
  AbsencesQuery,
  FollowUpQuery,
  ReportQuery,
} from "@faridalms/domain/attendance";

import { queryOptions } from "@tanstack/react-query";

import {
  getAbsenceReportInbox,
  getAbsences,
  getAttendanceBoard,
  getAttendanceDay,
  getAttendanceOffice,
  getAttendanceReport,
  getAttendanceSettings,
  getAttendanceToday,
  getClassAttendance,
  getFollowUp,
  getFrontDesk,
  getMyAbsenceReports,
  getRegister,
  getStudentAttendance,
} from "~/server/attendance";

export const attendanceDayQuery = (date = "") =>
  queryOptions({
    queryKey: ["attendance", "day", date],
    queryFn: () => getAttendanceDay({ data: { date } }),
  });

export const registerQuery = (classId: string, date: string, periodId = "") =>
  queryOptions({
    queryKey: ["attendance", "register", classId, date, periodId],
    queryFn: () => getRegister({ data: { classId, date, periodId } }),
  });

export const attendanceBoardQuery = (date = "") =>
  queryOptions({
    queryKey: ["attendance", "board", date],
    queryFn: () => getAttendanceBoard({ data: { date } }),
  });

export const absencesQuery = (query: AbsencesQuery) =>
  queryOptions({
    queryKey: ["attendance", "absences", query],
    queryFn: () => getAbsences({ data: query }),
    placeholderData: (previous) => previous,
  });

export const attendanceReportQuery = (query: ReportQuery) =>
  queryOptions({
    queryKey: ["attendance", "report", query],
    queryFn: () => getAttendanceReport({ data: query }),
    placeholderData: (previous) => previous,
  });

export const attendanceSettingsQuery = {
  queryKey: ["attendance", "settings"],
  queryFn: () => getAttendanceSettings(),
};

export const studentAttendanceQuery = (studentId = "", page = 1) =>
  queryOptions({
    queryKey: ["attendance", "student", studentId, page],
    queryFn: () => getStudentAttendance({ data: { studentId, page } }),
    placeholderData: (previous) => previous,
  });

export const classAttendanceQuery = (classId: string) =>
  queryOptions({
    queryKey: ["attendance", "class", classId],
    queryFn: () => getClassAttendance({ data: { id: classId } }),
  });

export const myAbsenceReportsQuery = (studentId = "") =>
  queryOptions({
    queryKey: ["attendance", "reports", "mine", studentId],
    queryFn: () => getMyAbsenceReports({ data: { studentId } }),
  });

export const absenceReportInboxQuery = (open = true) =>
  queryOptions({
    queryKey: ["attendance", "reports", "inbox", open],
    queryFn: () => getAbsenceReportInbox({ data: { open } }),
  });

export const followUpQuery = (query: FollowUpQuery = {}) =>
  queryOptions({
    queryKey: ["attendance", "follow-up", query],
    queryFn: () => getFollowUp({ data: query }),
    placeholderData: (previous) => previous,
  });

export const frontDeskQuery = (date = "") =>
  queryOptions({
    queryKey: ["attendance", "front-desk", date],
    queryFn: () => getFrontDesk({ data: { date } }),
  });

/** What attendance says of today for Today: the viewer's own, or a learner's they follow. */
export const attendanceTodayQuery = (studentId = "") => ({
  queryKey: ["attendance", "today", studentId],
  queryFn: () => getAttendanceToday({ data: { studentId } }),
});

export const attendanceOfficeQuery = {
  queryKey: ["attendance", "office"],
  queryFn: () => getAttendanceOffice(),
};
