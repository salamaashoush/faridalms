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
