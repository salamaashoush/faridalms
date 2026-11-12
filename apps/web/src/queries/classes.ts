import type { ClassDirectoryQuery, Views } from "@faridalms/domain/classes";

import { queryOptions } from "@tanstack/react-query";

import {
  getClassDirectory,
  getClassOptions,
  getClassRecord,
  getEnrollmentHistory,
  getMyClasses,
  getSubjects,
} from "~/server/classes";

export const classOptionsQuery = queryOptions({
  queryKey: ["classes", "options"],
  queryFn: () => getClassOptions(),
  staleTime: 60_000,
});

export const classDirectoryQuery = (
  query: ClassDirectoryQuery & { views: Views },
) => {
  const data = {
    q: query.q,
    ended: query.ended,
    views: query.views,
  };
  return queryOptions({
    queryKey: ["classes", "directory", data],
    queryFn: () => getClassDirectory({ data }),
  });
};

export const myClassesQuery = (views: Views) =>
  queryOptions({
    queryKey: ["classes", "mine", views],
    queryFn: () => getMyClasses({ data: { views } }),
  });

export const classRecordQuery = (id: string, on = "") =>
  queryOptions({
    queryKey: ["classes", "record", id, on],
    queryFn: () => getClassRecord({ data: { id, on } }),
  });

export const enrollmentHistoryQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["classes", "history", studentId],
    queryFn: () => getEnrollmentHistory({ data: { studentId } }),
  });

export const subjectsQuery = queryOptions({
  queryKey: ["classes", "subjects"],
  queryFn: () => getSubjects(),
});
