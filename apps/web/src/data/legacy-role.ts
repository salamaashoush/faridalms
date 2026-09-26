import type { Permission, Role } from "@faridalms/domain/identity";
import type { Workspace } from "@faridalms/domain/workspace";

import { ROLE_PERMISSIONS } from "@faridalms/domain/identity";

/**
 * Pages not yet rebuilt on the cell still speak the four old roles. Each use
 * goes with its page when that system is rebuilt, and this file with the last.
 */
export const LEGACY_ROLE: Record<Workspace, Role> = {
  admin: "admin",
  teach: "teacher",
  family: "parent",
  me: "student",
};

export function legacyPermissions(workspace: Workspace): readonly Permission[] {
  return ROLE_PERMISSIONS[LEGACY_ROLE[workspace]];
}
