import type { Permission } from "@faridalms/domain/identity";

import { useSuspenseQuery } from "@tanstack/react-query";

import { currentUserQuery } from "~/queries/user";

export function useCurrentUser() {
  return useSuspenseQuery(currentUserQuery).data;
}

/**
 * Capability check for the UI. The server re-checks every one of these; hiding
 * a control is a courtesy, never the enforcement.
 */
export function usePermission(permission: Permission): boolean {
  const user = useCurrentUser();
  return user.permissions.includes(permission);
}
