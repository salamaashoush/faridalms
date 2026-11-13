import {
  orderGradeLevelsSchema,
  retireGradeLevelSchema,
  saveGradeLevelSchema,
  setGradeTermSchema,
  setStudentGradeSchema,
} from "@faridalms/domain/grade-levels";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getGradeOptions = createServerFn({ method: "GET" }).handler(() =>
  record(backend().gradeLevels.options()),
);

export const getStudentGrades = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => record(backend().gradeLevels.student(data)));

export const setStudentGrade = createServerFn({ method: "POST" })
  .validator(checked(setStudentGradeSchema))
  .handler(({ data }) => backend().gradeLevels.setStudentGrade(data));

export const getGradeSettings = createServerFn({ method: "GET" }).handler(() =>
  record(backend().gradeLevels.settings()),
);

export const saveGradeLevel = createServerFn({ method: "POST" })
  .validator(checked(saveGradeLevelSchema))
  .handler(({ data }) => backend().gradeLevels.save(data));

export const orderGradeLevels = createServerFn({ method: "POST" })
  .validator(checked(orderGradeLevelsSchema))
  .handler(({ data }) => backend().gradeLevels.order(data));

export const retireGradeLevel = createServerFn({ method: "POST" })
  .validator(checked(retireGradeLevelSchema))
  .handler(({ data }) => backend().gradeLevels.retire(data));

export const getGradeTerm = createServerFn({ method: "GET" }).handler(() =>
  backend().gradeLevels.term(),
);

export const setGradeTerm = createServerFn({ method: "POST" })
  .validator(checked(setGradeTermSchema))
  .handler(({ data }) => backend().gradeLevels.setTerm(data));
