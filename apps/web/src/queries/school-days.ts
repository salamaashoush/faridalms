import { queryOptions } from "@tanstack/react-query";

import { getSchoolDays } from "~/server/school-days";

export const schoolDaysQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["school-days", from, to],
    queryFn: () => getSchoolDays({ data: { from, to } }),
  });
