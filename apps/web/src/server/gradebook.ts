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
