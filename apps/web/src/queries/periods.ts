import { queryOptions } from "@tanstack/react-query";

import { getSchoolPeriods, getTimetableDays } from "~/server/periods";

export const schoolPeriodsQuery = (on = "") =>
  queryOptions({
    queryKey: ["periods", on],
    queryFn: () => getSchoolPeriods({ data: { on } }),
  });

export const timetableDaysQuery = (from: string, to: string) => ({
  queryKey: ["periods", "days", from, to],
  queryFn: () => getTimetableDays({ data: { from, to } }),
});
