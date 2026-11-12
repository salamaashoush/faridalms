import { queryOptions } from "@tanstack/react-query";

import { getYearPeriods } from "~/server/periods";

export const yearPeriodsQuery = (id: string, on = "") =>
  queryOptions({
    queryKey: ["years", "periods", id, on],
    queryFn: () => getYearPeriods({ data: { id, on } }),
  });
