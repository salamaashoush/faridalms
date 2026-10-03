import { queryOptions } from "@tanstack/react-query";

import { getPlay } from "~/server/play";

export const playQuery = queryOptions({
  queryKey: ["play"],
  queryFn: () => getPlay(),
  staleTime: Number.POSITIVE_INFINITY,
});
