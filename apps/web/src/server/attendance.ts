import {
  absencesQuerySchema,
  attendanceSettingsSchema,
  dayQuerySchema,
  excuseSchema,
  registerQuerySchema,
  remindSchema,
  reportQuerySchema,
  checkInSchema,
  saveRegisterSchema,
  undoCheckInSchema,
} from "@faridalms/domain/attendance";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

export const getAttendanceDay = createServerFn({ method: "GET" })
  .validator(checked(dayQuerySchema))
  .handler(({ data }) => backend().attendance.day(data));

export const getRegister = createServerFn({ method: "GET" })
  .validator(checked(registerQuerySchema))
  .handler(({ data }) => record(backend().attendance.register(data)));

export const saveRegister = createServerFn({ method: "POST" })
  .validator(checked(saveRegisterSchema))
  .handler(({ data }) => backend().attendance.save(data));

export const getAttendanceBoard = createServerFn({ method: "GET" })
  .validator(checked(dayQuerySchema))
  .handler(({ data }) => backend().attendance.board(data));

export const getAbsences = createServerFn({ method: "GET" })
  .validator(checked(absencesQuerySchema))
  .handler(({ data }) => backend().attendance.absences(data));

export const excuseAbsences = createServerFn({ method: "POST" })
  .validator(checked(excuseSchema))
  .handler(({ data }) => backend().attendance.excuse(data));

export const getAttendanceReport = createServerFn({ method: "GET" })
  .validator(checked(reportQuerySchema))
  .handler(({ data }) => backend().attendance.report(data));

export const getAttendanceSettings = createServerFn({ method: "GET" }).handler(
  () => backend().attendance.settings(),
);

export const saveAttendanceSettings = createServerFn({ method: "POST" })
  .validator(checked(attendanceSettingsSchema))
  .handler(({ data }) => backend().attendance.saveSettings(data));

export const getStudentAttendance = createServerFn({ method: "GET" })
  .validator(
    checked(v.object({ studentId: v.optional(v.pipe(v.string(), v.uuid())) })),
  )
  .handler(({ data }) => record(backend().attendance.student(data)));

export const getClassAttendance = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) =>
    record(backend().attendance.classSummary({ classId: data.id })),
  );

export const remindTeachers = createServerFn({ method: "POST" })
  .validator(checked(remindSchema))
  .handler(({ data }) => backend().attendance.remind(data));

export const checkInToRegister = createServerFn({ method: "POST" })
  .validator(checked(checkInSchema))
  .handler(({ data }) => backend().attendance.checkIn(data));

export const undoCheckInToRegister = createServerFn({ method: "POST" })
  .validator(checked(undoCheckInSchema))
  .handler(({ data }) => backend().attendance.undoCheckIn(data));
