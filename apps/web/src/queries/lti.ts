import { queryOptions } from "@tanstack/react-query";

import { getAvailableTools, getLtiTools } from "~/server/lti";

export const ltiToolsQuery = queryOptions({
  queryKey: ["lti", "tools"],
  queryFn: () => getLtiTools(),
});

export const availableToolsQuery = queryOptions({
  queryKey: ["lti", "available"],
  queryFn: () => getAvailableTools(),
  staleTime: 60_000,
});
