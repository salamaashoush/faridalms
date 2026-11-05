import type { Keyset } from "@faridalms/domain/paging";

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import {
  getYear,
  getYearDays,
  getYearHistory,
  getYearPeriods,
  getYears,
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

export const yearDaysQuery = (id: string) =>
  queryOptions({
    queryKey: ["years", "days", id],
    queryFn: () => getYearDays({ data: { id } }),
  });

export const yearPeriodsQuery = (id: string, on = "") =>
  queryOptions({
    queryKey: ["years", "periods", id, on],
    queryFn: () => getYearPeriods({ data: { id, on } }),
  });
