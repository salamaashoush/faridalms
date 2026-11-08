import { queryOptions } from "@tanstack/react-query";

import { getAssistantSettings, getAssistantStatus } from "~/server/assistant";

export const assistantSettingsQuery = queryOptions({
  queryKey: ["assistant", "settings"],
  queryFn: () => getAssistantSettings(),
});

export const assistantStatusQuery = queryOptions({
  queryKey: ["assistant", "status"],
  queryFn: () => getAssistantStatus(),
  staleTime: 60_000,
});
