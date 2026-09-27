import { queryOptions } from "@tanstack/react-query";

import { getYear, getYearHistory, getYears } from "~/server/years";

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
  queryOptions({
    queryKey: ["years", "history", id],
    queryFn: () => getYearHistory({ data: { id } }),
  });
