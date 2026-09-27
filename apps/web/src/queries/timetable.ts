import { queryOptions } from "@tanstack/react-query";

import {
  getClashes,
  getClassWeek,
  getRoomWeek,
  getStudentWeek,
  getTeacherWeek,
  getTimetableGrid,
  getTimetableOptions,
} from "~/server/timetable";

export const timetableOptionsQuery = queryOptions({
  queryKey: ["timetable", "options"],
  queryFn: () => getTimetableOptions(),
});

export const timetableGridQuery = (classId: string, on = "") =>
  queryOptions({
    queryKey: ["timetable", "grid", classId, on],
    queryFn: () => getTimetableGrid({ data: { classId, on } }),
  });

export const clashesQuery = (on = "") =>
  queryOptions({
    queryKey: ["timetable", "clashes", on],
    queryFn: () => getClashes({ data: { on } }),
  });

export const teacherWeekQuery = (teacherId = "", on = "") =>
  queryOptions({
    queryKey: ["timetable", "teacher", teacherId, on],
    queryFn: () => getTeacherWeek({ data: { teacherId, on } }),
  });

export const roomWeekQuery = (roomId: string, on = "") =>
  queryOptions({
    queryKey: ["timetable", "room", roomId, on],
    queryFn: () => getRoomWeek({ data: { roomId, on } }),
  });

export const studentWeekQuery = (studentId = "") =>
  queryOptions({
    queryKey: ["timetable", "student", studentId],
    queryFn: () => getStudentWeek({ data: { studentId } }),
  });

export const classWeekQuery = (classId: string) =>
  queryOptions({
    queryKey: ["timetable", "class", classId],
    queryFn: () => getClassWeek({ data: { id: classId } }),
  });
