import type { Views } from "@faridalms/domain/classes";

import { queryOptions } from "@tanstack/react-query";

import {
  getClassQuestions,
  getPollResults,
  getClassVideos,
  getGallery,
  getProgramRuns,
  getLearningOptions,
  getLessonEditor,
  getPlan,
  getModuleGlossary,
  getModuleOutline,
  getModuleLive,
  getPaced,
  getPacing,
  getModuleProgress,
  getModuleRecord,
  getMyModules,
  getClassSounds,
  getNextLessons,
  getPracticeSet,
  getRouteChoices,
  getTeachingModules,
  getWrittenAnswers,
  getUnitPlan,
  getModuleDiscussions,
  openLesson,
} from "~/server/learning";

export const learningOptionsQuery = queryOptions({
  queryKey: ["learning", "options"],
  queryFn: () => getLearningOptions(),
});

/** The modules of the viewer's classes: one class's, those in the views given, or with `ended` those over. */
export const teachingModulesQuery = (
  classId: string,
  view: { ended?: boolean; views?: Views } = {},
) =>
  queryOptions({
    queryKey: ["learning", "teaching", classId, view],
    queryFn: () =>
      getTeachingModules({
        data: { classId, ended: view.ended ?? false, views: view.views ?? {} },
      }),
    placeholderData: (previous) => previous,
  });

export const unitPlanQuery = (classId: string) =>
  queryOptions({
    queryKey: ["learning", "units", classId],
    queryFn: () => getUnitPlan({ data: { classId } }),
    placeholderData: (previous) => previous,
  });

export const moduleDiscussionsQuery = (moduleId: string, studentId = "") =>
  queryOptions({
    queryKey: ["learning", "discussions", moduleId, studentId],
    queryFn: () => getModuleDiscussions({ data: { moduleId, studentId } }),
  });

export const moduleRecordQuery = (id: string) =>
  queryOptions({
    queryKey: ["learning", "module", id],
    queryFn: () => getModuleRecord({ data: { id } }),
  });

/** The scored lessons of other modules sharing a class that a lesson here can be routed by. */
export const routeChoicesQuery = (moduleId: string) =>
  queryOptions({
    queryKey: ["learning", "routes", moduleId],
    queryFn: () => getRouteChoices({ data: { moduleId } }),
  });

export const planQuery = (moduleId: string) =>
  queryOptions({
    queryKey: ["learning", "plan", moduleId],
    queryFn: () => getPlan({ data: { moduleId } }),
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

/** A lesson led live, asked again every few seconds for the teacher and the class board. */
export const pacedQuery = (id: string) =>
  queryOptions({
    queryKey: ["learning", "paced", id],
    queryFn: () => getPaced({ data: { id } }),
    placeholderData: (previous) => previous,
    refetchInterval: (query) => (query.state.data?.endedAt ? false : 3000),
  });

/**
 * Whether a student's class is being led through a lesson. While the player
 * hears the teacher's moves pushed, it asks only now and then in case a
 * signal was lost; without that channel it asks every few seconds while
 * the lesson is led, and now and then otherwise, to notice it begin.
 */
export const pacingQuery = (lessonId: string, pushed = false) =>
  queryOptions({
    queryKey: ["learning", "pacing", lessonId],
    queryFn: () => getPacing({ data: { lessonId } }),
    refetchInterval: (query) =>
      pushed ? 60_000 : query.state.data?.paced ? 3000 : 15_000,
  });

/** How a class answered a poll: how many answered, and how many chose each option. */
export interface PollCounts {
  answered: number;
  counts: Record<string, number>;
}

/** How a student's class answered a poll, asked again now and then as others answer. */
export const pollResultsQuery = (lessonId: string, blockId: string) =>
  queryOptions<PollCounts>({
    queryKey: ["learning", "poll", lessonId, blockId],
    queryFn: () => getPollResults({ data: { lessonId, blockId } }),
    placeholderData: (previous) => previous,
    refetchInterval: 15_000,
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

/** The words a module's lessons define, fetched when its glossary is opened. */
export const moduleGlossaryQuery = (id: string, studentId: string) =>
  queryOptions({
    queryKey: ["learning", "glossary", id, studentId],
    queryFn: () => getModuleGlossary({ data: { id, studentId } }),
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

export const galleryQuery = (lessonId: string, blockId: string) =>
  queryOptions({
    queryKey: ["learning", "gallery", lessonId, blockId],
    queryFn: () => getGallery({ data: { lessonId, blockId } }),
  });
