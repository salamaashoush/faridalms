import {
  classDirectorySchema,
  classRecordSchema,
  classYearSchema,
  enrolStudentSchema,
  saveClassSchema,
  saveSubjectSchema,
  withdrawStudentSchema,
} from "@faridalms/domain/classes";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getClassOptions = createServerFn({ method: "GET" }).handler(() =>
  backend().classes.options(),
);

export const getClassDirectory = createServerFn({ method: "GET" })
  .validator(checked(classDirectorySchema))
  .handler(({ data }) => record(backend().classes.directory(data)));

export const getMyClasses = createServerFn({ method: "GET" })
  .validator(checked(classYearSchema))
  .handler(({ data }) => record(backend().classes.mine(data)));

export const getClassRecord = createServerFn({ method: "GET" })
  .validator(checked(classRecordSchema))
  .handler(({ data }) => record(backend().classes.record(data)));

export const getEnrollmentHistory = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => record(backend().classes.history(data)));

export const saveClass = createServerFn({ method: "POST" })
  .validator(checked(saveClassSchema))
  .handler(({ data }) => backend().classes.save(data));

export const enrolStudent = createServerFn({ method: "POST" })
  .validator(checked(enrolStudentSchema))
  .handler(({ data }) => backend().classes.enrol(data));

export const withdrawStudent = createServerFn({ method: "POST" })
  .validator(checked(withdrawStudentSchema))
  .handler(({ data }) => backend().classes.withdraw(data));

export const getSubjects = createServerFn({ method: "GET" }).handler(() =>
  backend().classes.subjects(),
);

export const saveSubject = createServerFn({ method: "POST" })
  .validator(checked(saveSubjectSchema))
  .handler(({ data }) => backend().classes.saveSubject(data));
