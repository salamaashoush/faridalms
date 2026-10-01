import { queryOptions } from "@tanstack/react-query";

import {
  getClassGrading,
  getClassPlan,
  getGradingOverview,
} from "~/server/grading";

export const gradingOverviewQuery = queryOptions({
  queryKey: ["grading", "overview"],
  queryFn: () => getGradingOverview(),
});

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
