import { queryOptions } from "@tanstack/react-query";

import { getPrivacyOverview } from "~/server/privacy";

export const privacyOverviewQuery = queryOptions({
  queryKey: ["privacy", "overview"],
  queryFn: () => getPrivacyOverview(),
});
