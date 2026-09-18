import { queryOptions } from "@tanstack/react-query";

import {
  getAccessChanges,
  getAccessRoles,
  getUserAccess,
} from "~/server/access";

export const accessRolesQuery = queryOptions({
  queryKey: ["access", "roles"],
  queryFn: () => getAccessRoles(),
});
export const accessChangesQuery = (page: number) =>
  queryOptions({
    queryKey: ["access", "changes", page],
    queryFn: () => getAccessChanges({ data: { page } }),
    placeholderData: (previous) => previous,
  });
export const userAccessQuery = (userId: string) =>
  queryOptions({
    queryKey: ["access", "user", userId],
    queryFn: () => getUserAccess({ data: { userId } }),
  });
