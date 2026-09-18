import {
  SCHOOL_FEATURES,
  answerQuizSchema,
  completeLessonSchema,
  learnerModuleQuerySchema,
  learnerModulesQuerySchema,
  moduleRevisionSchema,
  saveLessonSchema,
  saveModuleSchema,
} from "@faridalms/domain/learning";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";

const idSchema = v.object({ id: v.pipe(v.string(), v.uuid()) });
const parse =
  <T extends v.GenericSchema>(schema: T) =>
  (input: unknown) =>
    v.parse(schema, input);

export const getSchoolFeatures = createServerFn({ method: "GET" }).handler(() =>
  backend().getSchoolFeatures(),
);
export const setSchoolFeature = createServerFn({ method: "POST" })
  .validator(
    parse(v.object({ key: v.picklist(SCHOOL_FEATURES), enabled: v.boolean() })),
  )
  .handler(({ data }) => backend().setSchoolFeature(data));

export const getTeachingModules = createServerFn({ method: "GET" }).handler(
  () => backend().getTeachingModules(),
);
export const getModuleAuthoring = createServerFn({ method: "GET" })
  .validator(parse(idSchema))
  .handler(({ data }) => record(backend().getModuleAuthoring(data)));
export const saveModule = createServerFn({ method: "POST" })
  .validator(parse(saveModuleSchema))
  .handler(({ data }) => backend().saveModule(data));
export const publishModule = createServerFn({ method: "POST" })
  .validator(parse(moduleRevisionSchema))
  .handler(({ data }) => backend().publishModule(data));
export const unpublishModule = createServerFn({ method: "POST" })
  .validator(parse(moduleRevisionSchema))
  .handler(({ data }) => backend().unpublishModule(data));
export const getLessonAuthoring = createServerFn({ method: "GET" })
  .validator(parse(idSchema))
  .handler(({ data }) => record(backend().getLessonAuthoring(data)));
export const saveLesson = createServerFn({ method: "POST" })
  .validator(parse(saveLessonSchema))
  .handler(({ data }) => backend().saveLesson(data));
export const deleteLesson = createServerFn({ method: "POST" })
  .validator(parse(idSchema))
  .handler(({ data }) => backend().deleteLesson(data));

export const getLearnerModules = createServerFn({ method: "GET" })
  .validator(parse(learnerModulesQuerySchema))
  .handler(({ data }) => record(backend().getLearnerModules(data)));
export const getLearnerModule = createServerFn({ method: "GET" })
  .validator(parse(learnerModuleQuerySchema))
  .handler(({ data }) => record(backend().getLearnerModule(data)));
export const getLearnerLesson = createServerFn({ method: "GET" })
  .validator(parse(learnerModuleQuerySchema))
  .handler(({ data }) => record(backend().getLearnerLesson(data)));
export const answerQuiz = createServerFn({ method: "POST" })
  .validator(parse(answerQuizSchema))
  .handler(({ data }) => backend().answerQuiz(data));
export const completeLesson = createServerFn({ method: "POST" })
  .validator(parse(completeLessonSchema))
  .handler(({ data }) => backend().completeLesson(data));
