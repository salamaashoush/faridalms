import type { ClassDirectoryQuery } from "@faridalms/domain/classes";

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

export const classDirectoryQuery = (query: ClassDirectoryQuery) =>
  queryOptions({
    queryKey: ["classes", "directory", query],
    queryFn: () => getClassDirectory({ data: query }),
  });

export const myClassesQuery = (year: string) =>
  queryOptions({
    queryKey: ["classes", "mine", year],
    queryFn: () => getMyClasses({ data: { year } }),
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
