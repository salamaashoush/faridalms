import type { Permission, Role } from "@faridalms/domain/identity";

import { ROLE_PERMISSIONS } from "@faridalms/domain/identity";
import { and, eq } from "drizzle-orm";

import type { Database } from "../index";

import { accessRoles, userAccessRoles } from "../schema";

export async function effectiveAccess(
  db: Pick<Database, "select">,
  user: { id: string; role: Role },
) {
  const [assigned] = await db
    .select({ profile: accessRoles, revision: userAccessRoles.revision })
    .from(userAccessRoles)
    .innerJoin(accessRoles, eq(accessRoles.id, userAccessRoles.accessRoleId))
    .where(eq(userAccessRoles.userId, user.id));
  if (assigned)
    return {
      permissions:
        assigned.profile.baseRole === user.role
          ? assigned.profile.permissions
          : ([] as Permission[]),
      accessRoleId: assigned.profile.id,
      accessRevision: assigned.revision,
    };
  const [defaults] = await db
    .select()
    .from(accessRoles)
    .where(
      and(
        eq(accessRoles.builtinRole, user.role),
        eq(accessRoles.baseRole, user.role),
      ),
    );
  return {
    permissions: defaults?.permissions ?? ROLE_PERMISSIONS[user.role],
    accessRoleId: null,
    accessRevision: 0,
  };
}
