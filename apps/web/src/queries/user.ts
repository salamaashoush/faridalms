import { queryOptions } from "@tanstack/react-query";

import { getCurrentUser } from "~/server/auth";

export const currentUserQuery = queryOptions({
  queryKey: ["user", "current"],
  queryFn: () => getCurrentUser(),
});
