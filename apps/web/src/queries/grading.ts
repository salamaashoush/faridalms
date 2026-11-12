import { queryOptions } from "@tanstack/react-query";

import {
  getClassGrading,
  getClassPlan,
  getGradingHistory,
  getGradingOverview,
} from "~/server/grading";

export const gradingOverviewQuery = {
  queryKey: ["grading", "overview"],
  queryFn: () => getGradingOverview(),
};

export const classGradingQuery = (classId: string) =>
  queryOptions({
    queryKey: ["grading", "class", classId],
    queryFn: () => getClassGrading({ data: { classId } }),
  });

export const classPlanQuery = (classId: string) =>
  queryOptions({
    queryKey: ["grading", "plan", classId],
    queryFn: () => getClassPlan({ data: { classId } }),
  });

export const gradingHistoryQuery = (page: number) =>
  queryOptions({
    queryKey: ["grading", "history", page],
    queryFn: () => getGradingHistory({ data: { page } }),
    placeholderData: (previous) => previous,
  });
