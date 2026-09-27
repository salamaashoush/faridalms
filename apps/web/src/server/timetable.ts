import {
  clashCheckSchema,
  clearSchema,
  gridQuerySchema,
  placeSchema,
  roomWeekSchema,
  studentWeekSchema,
  teacherWeekSchema,
  weekQuerySchema,
} from "@faridalms/domain/timetable";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

export const getTimetableOptions = createServerFn({ method: "GET" }).handler(
  () => backend().timetable.options(),
);

export const getTimetableGrid = createServerFn({ method: "GET" })
  .validator(checked(gridQuerySchema))
  .handler(({ data }) => record(backend().timetable.grid(data)));

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
  .validator(byId)
  .handler(({ data }) =>
    record(backend().timetable.classWeek({ classId: data.id })),
  );
