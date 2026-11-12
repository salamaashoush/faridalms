import type { Keyset } from "@faridalms/domain/paging";

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import {
  getClassYear,
  getPlacements,
  getStudentClassYears,
  getYear,
  getYearEnd,
  getYearHistory,
  getYearOptions,
  getYears,
  getYearsInSpan,
} from "~/server/years";

export const yearsQuery = queryOptions({
  queryKey: ["years", "directory"],
  queryFn: () => getYears(),
});

export const yearQuery = (id: string) =>
  queryOptions({
    queryKey: ["years", "record", id],
    queryFn: () => getYear({ data: { id } }),
  });

export const yearHistoryQuery = (id: string) =>
  infiniteQueryOptions({
    queryKey: ["years", "history", id],
    queryFn: ({ pageParam }) =>
      getYearHistory({ data: { id, after: pageParam } }),
    initialPageParam: null as Keyset | null,
    getNextPageParam: (last) => last.next ?? undefined,
  });

// Plain options, so a page's slot reads them as it reads its own.
export const yearOptionsQuery = {
  queryKey: ["years", "options"],
  queryFn: () => getYearOptions(),
};

export const classYearQuery = (classId: string) => ({
  queryKey: ["years", "class", classId],
  queryFn: () => getClassYear({ data: { classId } }),
});

export const studentClassYearsQuery = (studentId: string) => ({
  queryKey: ["people", "student", studentId, "class-years"],
  queryFn: () => getStudentClassYears({ data: { studentId } }),
});

export const placementsQuery = (studentId: string) => ({
  queryKey: ["people", "student", studentId, "placements"],
  queryFn: () => getPlacements({ data: { studentId } }),
});

export const yearEndQuery = {
  queryKey: ["years", "year-end"],
  queryFn: () => getYearEnd(),
};

/** What the class form's year part starts from: the years, and the class's own. */
export const classYearPartQuery = (classId: string | null) => ({
  queryKey: ["years", "class-part", classId ?? ""],
  queryFn: async () => ({
    options: await getYearOptions(),
    linked: classId ? (await getClassYear({ data: { classId } })).year : null,
  }),
});

export const yearsInSpanQuery = (from: string, to: string) => ({
  queryKey: ["years", "planner", from, to],
  queryFn: () => getYearsInSpan({ data: { from, to } }),
});
