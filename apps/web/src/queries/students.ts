import type { CreateSignInsInput } from "@faridalms/domain/first-sign-in";
import type { Keyset } from "@faridalms/domain/paging";
import type { StudentDirectoryQuery } from "@faridalms/domain/people";

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import {
  getPeopleOptions,
  getPersonHistory,
  getPersonProfile,
  getPersonRecord,
  getSiblings,
  getSignInsPlan,
  getStudentHistory,
  getStudentNotices,
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
  infiniteQueryOptions({
    queryKey: ["people", "student", id, "history"],
    queryFn: ({ pageParam }) =>
      getStudentHistory({ data: { id, after: pageParam } }),
    initialPageParam: null as Keyset | null,
    getNextPageParam: (last) => last.next ?? undefined,
  });

export const studentNoticesQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", "student", id, "notices"],
    queryFn: () => getStudentNotices({ data: { id } }),
  });

export const signInsPlanQuery = (input: CreateSignInsInput) =>
  queryOptions({
    queryKey: ["people", "sign-ins", input],
    queryFn: () => getSignInsPlan({ data: input }),
  });

export const personRecordQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", "person", id],
    queryFn: () => getPersonRecord({ data: { id } }),
  });

export const personProfileQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", "profile", id],
    queryFn: () => getPersonProfile({ data: { id } }),
  });

export const personHistoryQuery = (id: string) =>
  infiniteQueryOptions({
    queryKey: ["people", "person", id, "history"],
    queryFn: ({ pageParam }) =>
      getPersonHistory({ data: { id, after: pageParam } }),
    initialPageParam: null as Keyset | null,
    getNextPageParam: (last) => last.next ?? undefined,
  });

export const siblingsQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", "siblings", id],
    queryFn: () => getSiblings({ data: { id } }),
  });
