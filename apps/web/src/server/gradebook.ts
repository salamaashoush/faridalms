import {
  classBookSchema,
  releasePeriodSchema,
  savePeriodGradesSchema,
} from "@faridalms/domain/coursework";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getClassBook = createServerFn({ method: "GET" })
  .validator(checked(classBookSchema))
  .handler(({ data }) => record(backend().gradebook.classBook(data)));

export const getStudentGrades = createServerFn({ method: "GET" })
  .validator(
    checked(v.object({ studentId: v.optional(v.pipe(v.string(), v.uuid())) })),
  )
  .handler(({ data }) => record(backend().gradebook.student(data)));

export const savePeriodGrades = createServerFn({ method: "POST" })
  .validator(checked(savePeriodGradesSchema))
  .handler(({ data }) => backend().gradebook.savePeriodGrades(data));

export const releasePeriodGrades = createServerFn({ method: "POST" })
  .validator(checked(releasePeriodSchema))
  .handler(({ data }) => backend().gradebook.releasePeriod(data));

export const getWorkTerm = createServerFn({ method: "GET" })
  .validator(
    checked(
      v.object({
        classId: v.pipe(v.string(), v.uuid()),
        assignmentId: v.union([v.literal(""), v.pipe(v.string(), v.uuid())]),
      }),
    ),
  )
  .handler(({ data }) => record(backend().gradebook.workTerm(data)));

export const regradeTerm = createServerFn({ method: "POST" })
  .validator(
    checked(
      v.object({
        periodId: v.pipe(v.string(), v.uuid()),
        reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
      }),
    ),
  )
  .handler(({ data }) => backend().gradebook.regradeTerm(data));

const uuid = v.pipe(v.string(), v.uuid());
const version = v.pipe(v.number(), v.integer(), v.minValue(0));

export const getRunningGrades = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: v.optional(uuid) })))
  .handler(({ data }) => record(backend().gradebook.running(data)));

export const getRunningShown = createServerFn({ method: "GET" })
  .validator(checked(v.object({ classId: uuid })))
  .handler(({ data }) => record(backend().gradebook.runningShown(data)));

export const showRunning = createServerFn({ method: "POST" })
  .validator(
    checked(
      v.object({
        classId: uuid,
        shown: v.boolean(),
        expectedVersion: version,
      }),
    ),
  )
  .handler(({ data }) => backend().gradebook.showRunning(data));

export const getRunningDefault = createServerFn({ method: "GET" }).handler(() =>
  record(backend().gradebook.runningDefault()),
);

export const setRunningDefault = createServerFn({ method: "POST" })
  .validator(
    checked(v.object({ runningShown: v.boolean(), expectedVersion: version })),
  )
  .handler(({ data }) => backend().gradebook.setRunningDefault(data));
