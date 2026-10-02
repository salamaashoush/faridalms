import { queryOptions } from "@tanstack/react-query";

import { getClassBadges } from "~/server/badges";

export const classBadgesQuery = (classId: string) =>
  queryOptions({
    queryKey: ["badges", classId],
    queryFn: () => getClassBadges({ data: { classId } }),
  });
