import { queryOptions } from "@tanstack/react-query";

import {
  getClassGoals,
  getClassProgress,
  getCurriculumMap,
  getFramework,
  getFrameworks,
  getGoalsReport,
  getStandardSittings,
  getStudentProgress,
} from "~/server/standards";

export const frameworksQuery = queryOptions({
  queryKey: ["standards", "frameworks"],
  queryFn: () => getFrameworks(),
});

export const frameworkQuery = (id: string) =>
  queryOptions({
    queryKey: ["standards", "framework", id],
    queryFn: () => getFramework({ data: { id } }),
  });

/** One framework across the school year's unit plans. */
export const curriculumMapQuery = (frameworkId: string) =>
  queryOptions({
    queryKey: ["standards", "map", frameworkId],
    queryFn: () => getCurriculumMap({ data: { frameworkId } }),
    placeholderData: (previous) => previous,
  });

export const classProgressQuery = (classId: string) =>
  queryOptions({
    queryKey: ["standards", "class", classId],
    queryFn: () => getClassProgress({ data: { classId } }),
  });

export const studentProgressQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["standards", "student", studentId],
    queryFn: () => getStudentProgress({ data: { studentId } }),
  });

/** The sittings one student's mastery of a standard was worked out from. */
export const standardSittingsQuery = (studentId: string, standardId: string) =>
  queryOptions({
    queryKey: ["standards", "sittings", studentId, standardId],
    queryFn: () => getStandardSittings({ data: { studentId, standardId } }),
  });

/** One child's goals reports, as their family reads them. */
export const goalsReportQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["standards", "report", studentId],
    queryFn: () => getGoalsReport({ data: { studentId } }),
  });

export const classGoalsQuery = (classId: string, frameworkId: string) =>
  queryOptions({
    queryKey: ["standards", "goals", classId, frameworkId],
    queryFn: () => getClassGoals({ data: { classId, frameworkId } }),
  });
