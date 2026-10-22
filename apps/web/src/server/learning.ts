import {
  classSoundsSchema,
  copyLessonSchema,
  duplicateModuleSchema,
  decideShareSchema,
  galleryItemSchema,
  galleryRefSchema,
  keepCodeSchema,
  keepProjectSchema,
  markSchema,
  moduleRefSchema,
  moveLessonSchema,
  overrideSchema,
  paceSchema,
  planSchema,
  positionSchema,
  watchSchema,
  progressQuerySchema,
  publishModuleSchema,
  respondSchema,
  setClassSoundsSchema,
  revealSchema,
  runSchema,
  runsQuerySchema,
  saveLessonSchema,
  saveModuleSchema,
  savePlanSchema,
  startPacedSchema,
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

export const getRemarking = createServerFn({ method: "GET" })
  .validator(checked(v.object({ id: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => backend().learning.remarking(data));

export const copyLessonTo = createServerFn({ method: "POST" })
  .validator(checked(copyLessonSchema))
  .handler(({ data }) => backend().learning.copyLessonTo(data));

export const getPlan = createServerFn({ method: "GET" })
  .validator(checked(planSchema))
  .handler(({ data }) => record(backend().learning.plan(data)));

export const savePlan = createServerFn({ method: "POST" })
  .validator(checked(savePlanSchema))
  .handler(({ data }) => backend().learning.savePlan(data));

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

export const startPaced = createServerFn({ method: "POST" })
  .validator(checked(startPacedSchema))
  .handler(({ data }) => backend().learning.startPaced(data));

export const getPaced = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().learning.paced(data)));

export const pace = createServerFn({ method: "POST" })
  .validator(checked(paceSchema))
  .handler(({ data }) => backend().learning.pace(data));

export const endPaced = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => backend().learning.endPaced(data));

export const getPacing = createServerFn({ method: "GET" })
  .validator(checked(v.object({ lessonId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => backend().learning.pacing(data));

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

// A code exercise is marked by running it, which the API does on its own
// path; every other answer is marked as it is recorded.
export const respondToCheck = createServerFn({ method: "POST" })
  .validator(checked(respondSchema))
  .handler(({ data }) =>
    data.response.type === "program"
      ? backend().learning.respondProgram({
          lessonId: data.lessonId,
          blockId: data.blockId,
          code: data.response.code,
        })
      : backend().learning.respond(data),
  );

export const answerReview = createServerFn({ method: "POST" })
  .validator(checked(respondSchema))
  .handler(({ data }) =>
    data.response.type === "program"
      ? backend().learning.reviewProgram({
          lessonId: data.lessonId,
          blockId: data.blockId,
          code: data.response.code,
        })
      : backend().learning.reviewAnswer(data),
  );

export const keepOwnCode = createServerFn({ method: "POST" })
  .validator(checked(keepCodeSchema))
  .handler(({ data }) => backend().learning.keepCode(data));

export const keepOwnProject = createServerFn({ method: "POST" })
  .validator(checked(keepProjectSchema))
  .handler(({ data }) => backend().learning.keepProject(data));

export const getGallery = createServerFn({ method: "GET" })
  .validator(checked(galleryRefSchema))
  .handler(({ data }) => record(backend().learning.gallery(data)));

export const offerToGallery = createServerFn({ method: "POST" })
  .validator(checked(galleryRefSchema))
  .handler(({ data }) => backend().learning.offerShare(data));

export const takeFromGallery = createServerFn({ method: "POST" })
  .validator(checked(galleryRefSchema))
  .handler(({ data }) => backend().learning.withdrawShare(data));

export const remixFromGallery = createServerFn({ method: "POST" })
  .validator(checked(galleryItemSchema))
  .handler(({ data }) => backend().learning.remixShare(data));

export const decideGalleryOffer = createServerFn({ method: "POST" })
  .validator(checked(decideShareSchema))
  .handler(({ data }) => backend().learning.decideShare(data));

export const recordRun = createServerFn({ method: "POST" })
  .validator(checked(runSchema))
  .handler(({ data }) => backend().learning.run(data));

export const getProgramRuns = createServerFn({ method: "GET" })
  .validator(checked(runsQuerySchema))
  .handler(({ data }) => record(backend().learning.runs(data)));

export const revealCheck = createServerFn({ method: "POST" })
  .validator(checked(revealSchema))
  .handler(({ data }) => backend().learning.reveal(data));

export const askHint = createServerFn({ method: "POST" })
  .validator(checked(revealSchema))
  .handler(({ data }) => backend().learning.hint(data));

export const seeResults = createServerFn({ method: "POST" })
  .validator(checked(v.object({ lessonId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => backend().learning.results(data));

export const releaseLesson = createServerFn({ method: "POST" })
  .validator(
    checked(
      v.object({
        lessonId: v.pipe(v.string(), v.uuid()),
        classId: v.pipe(v.string(), v.uuid()),
      }),
    ),
  )
  .handler(({ data }) => backend().learning.release(data));

export const retryLesson = createServerFn({ method: "POST" })
  .validator(checked(v.object({ lessonId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => backend().learning.retry(data));

export const publishLesson = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => backend().learning.publishLesson(data));

export const getClassQuestions = createServerFn({ method: "GET" })
  .validator(checked(progressQuerySchema))
  .handler(({ data }) => record(backend().learning.questions(data)));

export const getClassVideos = createServerFn({ method: "GET" })
  .validator(checked(progressQuerySchema))
  .handler(({ data }) => record(backend().learning.videos(data)));

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

export const saveWatch = createServerFn({ method: "POST" })
  .validator(checked(watchSchema))
  .handler(({ data }) => backend().learning.watch(data));

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
