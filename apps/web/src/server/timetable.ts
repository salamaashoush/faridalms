import {
  changeLessonSchema,
  clashCheckSchema,
  classWeekSchema,
  clearChangeSchema,
  clearSchema,
  coverDaySchema,
  coverOptionsSchema,
  gridQuerySchema,
  placeSchema,
  removeAbsenceSchema,
  removeTimetableSchema,
  roomWeekSchema,
  saveTimetableSchema,
  staffAbsenceSchema,
  studentWeekSchema,
  teacherWeekSchema,
  timetablesQuerySchema,
  weekQuerySchema,
} from "@faridalms/domain/timetable";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getTimetableOptions = createServerFn({ method: "GET" }).handler(
  () => backend().timetable.options(),
);

export const getTimetableGrid = createServerFn({ method: "GET" })
  .validator(checked(gridQuerySchema))
  .handler(({ data }) => record(backend().timetable.grid(data)));

export const getTimetables = createServerFn({ method: "GET" })
  .validator(checked(timetablesQuerySchema))
  .handler(({ data }) => backend().timetable.timetables(data));

export const saveTimetable = createServerFn({ method: "POST" })
  .validator(checked(saveTimetableSchema))
  .handler(({ data }) => backend().timetable.saveTimetable(data));

export const removeTimetable = createServerFn({ method: "POST" })
  .validator(checked(removeTimetableSchema))
  .handler(({ data }) => backend().timetable.removeTimetable(data));

export const checkPlacement = createServerFn({ method: "POST" })
  .validator(checked(clashCheckSchema))
  .handler(({ data }) => backend().timetable.check(data));

export const placeMeeting = createServerFn({ method: "POST" })
  .validator(checked(placeSchema))
  .handler(({ data }) => backend().timetable.place(data));

export const clearCell = createServerFn({ method: "POST" })
  .validator(checked(clearSchema))
  .handler(({ data }) => backend().timetable.clear(data));

export const getClashes = createServerFn({ method: "GET" })
  .validator(checked(weekQuerySchema))
  .handler(({ data }) => backend().timetable.clashes(data));

export const getTeacherWeek = createServerFn({ method: "GET" })
  .validator(checked(teacherWeekSchema))
  .handler(({ data }) => backend().timetable.teacherWeek(data));

export const getRoomWeek = createServerFn({ method: "GET" })
  .validator(checked(roomWeekSchema))
  .handler(({ data }) => backend().timetable.roomWeek(data));

export const getStudentWeek = createServerFn({ method: "GET" })
  .validator(checked(studentWeekSchema))
  .handler(({ data }) => record(backend().timetable.studentWeek(data)));

export const getClassWeek = createServerFn({ method: "GET" })
  .validator(checked(classWeekSchema))
  .handler(({ data }) => record(backend().timetable.classWeek(data)));

export const getCoverDay = createServerFn({ method: "GET" })
  .validator(checked(coverDaySchema))
  .handler(({ data }) => backend().cover.day(data));

export const getCoverOptions = createServerFn({ method: "GET" })
  .validator(checked(coverOptionsSchema))
  .handler(({ data }) => backend().cover.options(data));

export const recordStaffAbsence = createServerFn({ method: "POST" })
  .validator(checked(staffAbsenceSchema))
  .handler(({ data }) => backend().cover.setAbsence(data));

export const endStaffAbsence = createServerFn({ method: "POST" })
  .validator(checked(removeAbsenceSchema))
  .handler(({ data }) => backend().cover.removeStaffAbsence(data));

export const changeLesson = createServerFn({ method: "POST" })
  .validator(checked(changeLessonSchema))
  .handler(({ data }) => backend().cover.changeLesson(data));

export const restoreLesson = createServerFn({ method: "POST" })
  .validator(checked(clearChangeSchema))
  .handler(({ data }) => backend().cover.clearLessonChange(data));
