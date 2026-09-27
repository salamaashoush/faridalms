import { queryOptions } from "@tanstack/react-query";

import {
  getAccessChanges,
  getAccessRoles,
  getPersonAccess,
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

export const personAccessQuery = (userId: string) =>
  queryOptions({
    queryKey: ["access", "person", userId],
    queryFn: () => getPersonAccess({ data: { userId } }),
  });
