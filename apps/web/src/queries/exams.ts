import { queryOptions } from "@tanstack/react-query";

import {
  getCoursework,
  getCourseworkList,
  getCourseworkStudents,
  getExamHistory,
  getExamOverview,
  getMyStanding,
  getWorkStanding,
} from "~/server/exams";

export const examOverviewQuery = queryOptions({
  queryKey: ["exams", "overview"],
  queryFn: () => getExamOverview(),
});

export const examHistoryQuery = (page: number) =>
  queryOptions({
    queryKey: ["exams", "history", page],
    queryFn: () => getExamHistory({ data: { page } }),
  });

export const courseworkQuery = (assignmentId: string) =>
  queryOptions({
    queryKey: ["exams", "coursework", assignmentId],
    queryFn: () => getCoursework({ data: { assignmentId } }),
  });

export const workStandingQuery = (assignmentId: string) =>
  queryOptions({
    queryKey: ["exams", "standing", assignmentId],
    queryFn: () => getWorkStanding({ data: { assignmentId } }),
  });

export const myStandingQuery = (assignmentId: string) =>
  queryOptions({
    queryKey: ["exams", "mine", assignmentId],
    queryFn: () => getMyStanding({ data: { assignmentId } }),
  });

export const courseworkListQuery = queryOptions({
  queryKey: ["exams", "coursework-list"],
  queryFn: () => getCourseworkList(),
});

export const courseworkStudentsQuery = (assignmentId: string) =>
  queryOptions({
    queryKey: ["exams", "coursework-students", assignmentId],
    queryFn: () => getCourseworkStudents({ data: { assignmentId } }),
  });
