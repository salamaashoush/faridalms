import * as v from "valibot";

import type { Permission, Role } from "./identity";

import { PERMISSIONS, ROLES } from "./identity";

/** The capability that administers capabilities; a school may never lose its last holder. */
export const ACCESS_ADMIN_PERMISSION: Permission = "access:manage";

const id = v.pipe(v.string(), v.uuid());

export const saveAccessRoleSchema = v.object({
  id,
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(0)),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(128)),
  baseRole: v.picklist(ROLES),
  permissions: v.pipe(v.array(v.picklist(PERMISSIONS)), v.maxLength(64)),
});
export type SaveAccessRoleInput = v.InferOutput<typeof saveAccessRoleSchema>;

export const assignAccessRoleSchema = v.object({
  userId: id,
  /** Null returns the person to the built-in role for their base role. */
  accessRoleId: v.nullable(id),
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export type AssignAccessRoleInput = v.InferOutput<
  typeof assignAccessRoleSchema
>;

export const accessChangesQuerySchema = v.object({
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});

/** Permissions the actor may hand out: only those they hold themselves. */
export function grantable(
  actorPermissions: readonly Permission[],
  requested: readonly Permission[],
): { allowed: Permission[]; refused: Permission[] } {
  const held = new Set(actorPermissions);
  const allowed: Permission[] = [];
  const refused: Permission[] = [];
  for (const permission of new Set(requested))
    (held.has(permission) ? allowed : refused).push(permission);
  return { allowed, refused };
}

/** Removing a permission from a role that already had it. */
export function withdrawn(
  before: readonly Permission[],
  after: readonly Permission[],
): Permission[] {
  const kept = new Set(after);
  return before.filter((permission) => !kept.has(permission));
}

export function roleFitsBase(baseRole: Role, userRole: Role): boolean {
  return baseRole === userRole;
}
