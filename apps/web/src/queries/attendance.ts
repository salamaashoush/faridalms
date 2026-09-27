import type { AbsencesQuery, ReportQuery } from "@faridalms/domain/attendance";

import { queryOptions } from "@tanstack/react-query";

import {
  getAbsences,
  getAttendanceBoard,
  getAttendanceDay,
  getAttendanceReport,
  getAttendanceSettings,
  getClassAttendance,
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

export const attendanceSettingsQuery = queryOptions({
  queryKey: ["attendance", "settings"],
  queryFn: () => getAttendanceSettings(),
});

export const studentAttendanceQuery = (studentId = "") =>
  queryOptions({
    queryKey: ["attendance", "student", studentId],
    queryFn: () =>
      getStudentAttendance({ data: studentId ? { studentId } : {} }),
  });

export const classAttendanceQuery = (classId: string) =>
  queryOptions({
    queryKey: ["attendance", "class", classId],
    queryFn: () => getClassAttendance({ data: { id: classId } }),
  });
