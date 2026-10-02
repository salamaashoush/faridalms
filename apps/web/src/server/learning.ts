import {
  classSoundsSchema,
  duplicateModuleSchema,
  markSchema,
  moduleRefSchema,
  moveLessonSchema,
  overrideSchema,
  positionSchema,
  progressQuerySchema,
  publishModuleSchema,
  respondSchema,
  setClassSoundsSchema,
  revealSchema,
  saveLessonSchema,
  saveModuleSchema,
} from "@faridalms/domain/learning";
import {
  practiceCheckSchema,
  practiceSetSchema,
} from "@faridalms/domain/practice";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

const optionalId = v.optional(
  v.union([v.literal(""), v.pipe(v.string(), v.uuid())]),
  "",
);

export const getLearningOptions = createServerFn({ method: "GET" }).handler(
  () => backend().learning.options(),
);

export const getTeachingModules = createServerFn({ method: "GET" })
  .validator(checked(v.object({ classId: optionalId })))
  .handler(({ data }) => backend().learning.modules(data));

export const getModuleRecord = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().learning.record(data)));

export const saveModule = createServerFn({ method: "POST" })
  .validator(checked(saveModuleSchema))
  .handler(({ data }) => backend().learning.saveModule(data));

export const publishModule = createServerFn({ method: "POST" })
  .validator(checked(publishModuleSchema))
  .handler(({ data }) => backend().learning.publishModule(data));

export const unpublishModule = createServerFn({ method: "POST" })
  .validator(checked(moduleRefSchema))
  .handler(({ data }) => backend().learning.unpublishModule(data));

export const archiveModule = createServerFn({ method: "POST" })
  .validator(checked(moduleRefSchema))
  .handler(({ data }) => backend().learning.archiveModule(data));

export const duplicateModule = createServerFn({ method: "POST" })
  .validator(checked(duplicateModuleSchema))
  .handler(({ data }) => backend().learning.duplicateModule(data));

export const getLessonEditor = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().learning.lesson(data)));

export const saveLesson = createServerFn({ method: "POST" })
  .validator(checked(saveLessonSchema))
  .handler(({ data }) => backend().learning.saveLesson(data));

export const moveLesson = createServerFn({ method: "POST" })
  .validator(checked(moveLessonSchema))
  .handler(({ data }) => backend().learning.moveLesson(data));

export const removeLesson = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => backend().learning.removeLesson(data));

export const getModuleProgress = createServerFn({ method: "GET" })
  .validator(checked(progressQuerySchema))
  .handler(({ data }) => record(backend().learning.progress(data)));

export const getModuleLive = createServerFn({ method: "GET" })
  .validator(checked(progressQuerySchema))
  .handler(({ data }) => record(backend().learning.live(data)));

export const overrideLesson = createServerFn({ method: "POST" })
  .validator(checked(overrideSchema))
  .handler(({ data }) => backend().learning.override(data));

export const getNextLessons = createServerFn({ method: "GET" }).handler(() =>
  backend().learning.nextLessons(),
);

export const getMyModules = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: optionalId })))
  .handler(({ data }) => backend().learning.mine(data));

export const getModuleOutline = createServerFn({ method: "GET" })
  .validator(
    checked(
      v.object({ id: v.pipe(v.string(), v.uuid()), studentId: optionalId }),
    ),
  )
  .handler(({ data }) => record(backend().learning.play(data)));

export const openLesson = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => record(backend().learning.playLesson(data)));

export const respondToCheck = createServerFn({ method: "POST" })
  .validator(checked(respondSchema))
  .handler(({ data }) => backend().learning.respond(data));

export const answerReview = createServerFn({ method: "POST" })
  .validator(checked(respondSchema))
  .handler(({ data }) => backend().learning.reviewAnswer(data));

export const revealCheck = createServerFn({ method: "POST" })
  .validator(checked(revealSchema))
  .handler(({ data }) => backend().learning.reveal(data));

export const retryLesson = createServerFn({ method: "POST" })
  .validator(checked(v.object({ lessonId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => backend().learning.retry(data));

export const publishLesson = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => backend().learning.publishLesson(data));

export const getClassQuestions = createServerFn({ method: "GET" })
  .validator(checked(progressQuerySchema))
  .handler(({ data }) => record(backend().learning.questions(data)));

export const getWrittenAnswers = createServerFn({ method: "GET" })
  .validator(checked(progressQuerySchema))
  .handler(({ data }) => record(backend().learning.answers(data)));

export const markAnswer = createServerFn({ method: "POST" })
  .validator(checked(markSchema))
  .handler(({ data }) => backend().learning.mark(data));

export const completeLesson = createServerFn({ method: "POST" })
  .validator(checked(v.object({ lessonId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => backend().learning.complete(data));

export const saveReadingPosition = createServerFn({ method: "POST" })
  .validator(checked(positionSchema))
  .handler(({ data }) => backend().learning.position(data));

export const getClassSounds = createServerFn({ method: "GET" })
  .validator(checked(classSoundsSchema))
  .handler(({ data }) => backend().learning.classSounds(data));

export const changeClassSounds = createServerFn({ method: "POST" })
  .validator(checked(setClassSoundsSchema))
  .handler(({ data }) => backend().learning.setClassSounds(data));

export const getPracticeSet = createServerFn({ method: "GET" })
  .validator(checked(practiceSetSchema))
  .handler(({ data }) => backend().learning.practiceSet(data));

export const checkPractice = createServerFn({ method: "POST" })
  .validator(checked(practiceCheckSchema))
  .handler(({ data }) => backend().learning.practiceCheck(data));
