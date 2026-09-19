import { queryOptions } from "@tanstack/react-query";

import { getRollover } from "~/server/rollover";

export const rolloverQuery = (query: {
  sourceYearId: string;
  targetYearId: string;
}) =>
  queryOptions({
    queryKey: [
      "academic-years",
      "rollover",
      query.sourceYearId,
      query.targetYearId,
    ],
    queryFn: () => getRollover({ data: query }),
  });
