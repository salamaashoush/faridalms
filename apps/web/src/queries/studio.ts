import { queryOptions } from "@tanstack/react-query";

import { getStudio } from "~/server/studio";

export const studioQuery = queryOptions({
  queryKey: ["studio"],
  queryFn: () => getStudio(),
  staleTime: Number.POSITIVE_INFINITY,
});
