import type { StudentDirectoryQuery } from "@faridalms/domain/people";

import { queryOptions } from "@tanstack/react-query";

import {
  getPeopleOptions,
  getPersonHistory,
  getPersonRecord,
  getSiblings,
  getStudentHistory,
  getStudentRecord,
  getStudents,
} from "~/server/students";

export const peopleOptionsQuery = queryOptions({
  queryKey: ["people", "options"],
  queryFn: () => getPeopleOptions(),
  staleTime: 60_000,
});

export const studentsQuery = (query: StudentDirectoryQuery) =>
  queryOptions({
    queryKey: ["people", "students", query],
    queryFn: () => getStudents({ data: query }),
  });

export const studentRecordQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", "student", id],
    queryFn: () => getStudentRecord({ data: { id } }),
  });

export const studentHistoryQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", "student", id, "history"],
    queryFn: () => getStudentHistory({ data: { id } }),
  });

export const personRecordQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", "person", id],
    queryFn: () => getPersonRecord({ data: { id } }),
  });

export const personHistoryQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", "person", id, "history"],
    queryFn: () => getPersonHistory({ data: { id } }),
  });

export const siblingsQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", "siblings", id],
    queryFn: () => getSiblings({ data: { id } }),
  });
