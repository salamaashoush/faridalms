import {
  absenceReportSchema,
  absencesQuerySchema,
  attendanceSettingsSchema,
  decideReportSchema,
  familyReportsSchema,
  findStudentSchema,
  followUpQuerySchema,
  frontDeskQuerySchema,
  pickupQuerySchema,
  signInSchema,
  signOutSchema,
  logContactSchema,
  reportInboxSchema,
  withdrawReportSchema,
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

export const getMyAbsenceReports = createServerFn({ method: "GET" })
  .validator(checked(familyReportsSchema))
  .handler(({ data }) => backend().absenceReports.mine(data));

export const reportAbsence = createServerFn({ method: "POST" })
  .validator(checked(absenceReportSchema))
  .handler(({ data }) => backend().absenceReports.report(data));

export const withdrawAbsenceReport = createServerFn({ method: "POST" })
  .validator(checked(withdrawReportSchema))
  .handler(({ data }) => backend().absenceReports.withdraw(data));

export const getAbsenceReportInbox = createServerFn({ method: "GET" })
  .validator(checked(reportInboxSchema))
  .handler(({ data }) => backend().absenceReports.inbox(data));

export const decideAbsenceReport = createServerFn({ method: "POST" })
  .validator(checked(decideReportSchema))
  .handler(({ data }) => backend().absenceReports.decide(data));

export const getFollowUp = createServerFn({ method: "GET" })
  .validator(checked(followUpQuerySchema))
  .handler(({ data }) => backend().followUp.day(data));

export const logAttendanceContact = createServerFn({ method: "POST" })
  .validator(checked(logContactSchema))
  .handler(({ data }) => backend().followUp.logContact(data));

export const getFrontDesk = createServerFn({ method: "GET" })
  .validator(checked(frontDeskQuerySchema))
  .handler(({ data }) => backend().frontDesk.day(data));

export const findDeskStudents = createServerFn({ method: "GET" })
  .validator(checked(findStudentSchema))
  .handler(({ data }) => backend().frontDesk.find(data));

export const getPickupContacts = createServerFn({ method: "GET" })
  .validator(checked(pickupQuerySchema))
  .handler(({ data }) => backend().frontDesk.pickup(data));

export const signStudentIn = createServerFn({ method: "POST" })
  .validator(checked(signInSchema))
  .handler(({ data }) => backend().frontDesk.signIn(data));

export const signStudentOut = createServerFn({ method: "POST" })
  .validator(checked(signOutSchema))
  .handler(({ data }) => backend().frontDesk.signOut(data));
