import { queryOptions } from "@tanstack/react-query";

import { getYearDays } from "~/server/school-days";

export const yearDaysQuery = (id: string) =>
  queryOptions({
    queryKey: ["years", "days", id],
    queryFn: () => getYearDays({ data: { id } }),
  });
