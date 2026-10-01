import { queryOptions } from "@tanstack/react-query";

import { getExamHistory, getExamOverview } from "~/server/exams";

export const examOverviewQuery = queryOptions({
  queryKey: ["exams", "overview"],
  queryFn: () => getExamOverview(),
});

export const examHistoryQuery = (page: number) =>
  queryOptions({
    queryKey: ["exams", "history", page],
    queryFn: () => getExamHistory({ data: { page } }),
  });
