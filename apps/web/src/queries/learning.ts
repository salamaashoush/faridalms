import { queryOptions } from "@tanstack/react-query";

import {
  getLearnerLesson,
  getLearnerModule,
  getLearnerModules,
  getLessonAuthoring,
  getModuleAuthoring,
  getModuleClasses,
  getTeachingModules,
} from "~/server/learning";

export const teachingModulesQuery = queryOptions({
  queryKey: ["learning", "teaching"],
  queryFn: () => getTeachingModules(),
});
export const moduleClassesQuery = queryOptions({
  queryKey: ["learning", "classes"],
  queryFn: () => getModuleClasses(),
});
export const moduleAuthoringQuery = (id: string) =>
  queryOptions({
    queryKey: ["learning", "module", id],
    queryFn: () => getModuleAuthoring({ data: { id } }),
  });
export const lessonAuthoringQuery = (id: string) =>
  queryOptions({
    queryKey: ["learning", "lesson", id],
    queryFn: () => getLessonAuthoring({ data: { id } }),
  });
export const learnerModulesQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["learning", "learner", studentId, "modules"],
    queryFn: () => getLearnerModules({ data: { studentId } }),
    placeholderData: (previous) => previous,
  });
export const learnerModuleQuery = (id: string, studentId: string) =>
  queryOptions({
    queryKey: ["learning", "learner", studentId, "module", id],
    queryFn: () => getLearnerModule({ data: { id, studentId } }),
  });
export const learnerLessonQuery = (id: string, studentId: string) =>
  queryOptions({
    queryKey: ["learning", "learner", studentId, "lesson", id],
    queryFn: () => getLearnerLesson({ data: { id, studentId } }),
  });
