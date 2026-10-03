import { queryOptions } from "@tanstack/react-query";

import {
  getClassQuestions,
  getClassVideos,
  getProgramRuns,
  getLearningOptions,
  getLessonEditor,
  getModuleOutline,
  getModuleLive,
  getModuleProgress,
  getModuleRecord,
  getMyModules,
  getClassSounds,
  getNextLessons,
  getPracticeSet,
  getTeachingModules,
  getWrittenAnswers,
  openLesson,
} from "~/server/learning";

export const learningOptionsQuery = queryOptions({
  queryKey: ["learning", "options"],
  queryFn: () => getLearningOptions(),
});

export const teachingModulesQuery = (classId: string) =>
  queryOptions({
    queryKey: ["learning", "teaching", classId],
    queryFn: () => getTeachingModules({ data: { classId } }),
    placeholderData: (previous) => previous,
  });

export const moduleRecordQuery = (id: string) =>
  queryOptions({
    queryKey: ["learning", "module", id],
    queryFn: () => getModuleRecord({ data: { id } }),
  });

export const lessonEditorQuery = (id: string) =>
  queryOptions({
    queryKey: ["learning", "lesson", id],
    queryFn: () => getLessonEditor({ data: { id } }),
  });

export const moduleProgressQuery = (moduleId: string, classId: string) =>
  queryOptions({
    queryKey: ["learning", "progress", moduleId, classId],
    queryFn: () => getModuleProgress({ data: { moduleId, classId } }),
    placeholderData: (previous) => previous,
  });

/** Asked again every ten seconds while the page is in view, for a teacher in the room. */
export const moduleLiveQuery = (moduleId: string, classId: string) =>
  queryOptions({
    queryKey: ["learning", "live", moduleId, classId],
    queryFn: () => getModuleLive({ data: { moduleId, classId } }),
    placeholderData: (previous) => previous,
    refetchInterval: 10_000,
  });

export const classQuestionsQuery = (moduleId: string, classId: string) =>
  queryOptions({
    queryKey: ["learning", "questions", moduleId, classId],
    queryFn: () => getClassQuestions({ data: { moduleId, classId } }),
    placeholderData: (previous) => previous,
  });

export const programRunsQuery = (input: {
  moduleId: string;
  classId: string;
  lessonId: string;
  blockId: string;
  studentId: string;
}) =>
  queryOptions({
    queryKey: [
      "learning",
      "runs",
      input.moduleId,
      input.classId,
      input.lessonId,
      input.blockId,
      input.studentId,
    ],
    queryFn: () => getProgramRuns({ data: input }),
  });

export const classVideosQuery = (moduleId: string, classId: string) =>
  queryOptions({
    queryKey: ["learning", "videos", moduleId, classId],
    queryFn: () => getClassVideos({ data: { moduleId, classId } }),
    placeholderData: (previous) => previous,
  });

export const writtenAnswersQuery = (moduleId: string, classId: string) =>
  queryOptions({
    queryKey: ["learning", "answers", moduleId, classId],
    queryFn: () => getWrittenAnswers({ data: { moduleId, classId } }),
    placeholderData: (previous) => previous,
  });

export const nextLessonsQuery = queryOptions({
  queryKey: ["learning", "next"],
  queryFn: () => getNextLessons(),
});

export const myModulesQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["learning", "mine", studentId],
    queryFn: () => getMyModules({ data: { studentId } }),
  });

export const moduleOutlineQuery = (id: string, studentId: string) =>
  queryOptions({
    queryKey: ["learning", "outline", id, studentId],
    queryFn: () => getModuleOutline({ data: { id, studentId } }),
  });

/** Opening a lesson records that the student began it, so it is fetched once per visit. */
export const lessonQuery = (id: string) =>
  queryOptions({
    queryKey: ["learning", "play", id],
    queryFn: () => openLesson({ data: { id } }),
    staleTime: Number.POSITIVE_INFINITY,
  });

export const classSoundsQuery = (classId: string) =>
  queryOptions({
    queryKey: ["learning", "class-sounds", classId],
    queryFn: () => getClassSounds({ data: { classId } }),
  });

export const practiceSetQuery = (moduleId: string, round: number) =>
  queryOptions({
    queryKey: ["learning", "practice", moduleId, round],
    queryFn: () => getPracticeSet({ data: { moduleId, round } }),
    // A review stays the same while it is worked through.
    staleTime: Number.POSITIVE_INFINITY,
  });
