import { queryOptions } from "@tanstack/react-query";

import {
  getClashes,
  getClassWeek,
  getCoverDay,
  getCoverOptions,
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

export const studentWeekQuery = (studentId = "", on = "") =>
  queryOptions({
    queryKey: ["timetable", "student", studentId, on],
    queryFn: () => getStudentWeek({ data: { studentId, on } }),
  });

export const classWeekQuery = (classId: string, on = "") =>
  queryOptions({
    queryKey: ["timetable", "class", classId, on],
    queryFn: () => getClassWeek({ data: { classId, on } }),
  });

export const coverDayQuery = (on = "") =>
  queryOptions({
    queryKey: ["timetable", "cover", on],
    queryFn: () => getCoverDay({ data: { on } }),
  });

export const coverOptionsQuery = (input: {
  classId: string;
  periodId: string;
  on: string;
}) =>
  queryOptions({
    queryKey: ["timetable", "cover-options", input],
    queryFn: () => getCoverOptions({ data: input }),
  });
