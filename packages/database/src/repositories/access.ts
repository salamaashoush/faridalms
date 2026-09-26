import type {
  AssignAccessRoleInput,
  SaveAccessRoleInput,
} from "@faridalms/domain/access";
import type { Permission, Role } from "@faridalms/domain/identity";

import {
  ACCESS_ADMIN_PERMISSION,
  grantable,
  roleFitsBase,
  withdrawn,
} from "@faridalms/domain/access";
import { ROLES, ROLE_PERMISSIONS } from "@faridalms/domain/identity";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../index";

import { accessChanges, accessRoles, userAccessRoles, users } from "../schema";
import { ManagementError } from "./management";

type Executor = Database | DatabaseTransaction;

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

export interface Actor {
  id: string;
  permissions: readonly Permission[];
}

/**
 * Every role a school can assign: the four built-in ones, materialised from
 * the static matrix until someone edits them, plus the school's own roles.
 */
export async function listAccessRoles(db: Database) {
  const rows = await db
    .select({
      role: accessRoles,
      members: sql<number>`(select count(*) from ${userAccessRoles} u where u.access_role_id = ${accessRoles.id})::int`,
    })
    .from(accessRoles)
    .orderBy(accessRoles.name);
  const stored = new Map(rows.map((row) => [row.role.builtinRole, row]));
  const onDefault = await db
    .select({ role: users.role, n: count() })
    .from(users)
    .leftJoin(userAccessRoles, eq(userAccessRoles.userId, users.id))
    .where(and(eq(users.isActive, true), isNull(userAccessRoles.userId)))
    .groupBy(users.role);
  const defaults = new Map(onDefault.map((row) => [row.role, row.n]));
  const builtins = ROLES.map((role) => {
    const row = stored.get(role);
    const members = (defaults.get(role) ?? 0) + (row?.members ?? 0);
    return row
      ? {
          id: row.role.id,
          name: row.role.name,
          baseRole: row.role.baseRole,
          builtinRole: role,
          permissions: row.role.permissions,
          revision: row.role.revision,
          members,
          stored: true,
          updatedAt: row.role.updatedAt,
        }
      : {
          id: null,
          name: null,
          baseRole: role,
          builtinRole: role,
          permissions: ROLE_PERMISSIONS[role],
          revision: 0,
          members,
          stored: false,
          updatedAt: null,
        };
  });
  const custom = rows
    .filter((row) => row.role.builtinRole === null)
    .map((row) => ({
      id: row.role.id,
      name: row.role.name,
      baseRole: row.role.baseRole,
      builtinRole: null,
      permissions: row.role.permissions,
      revision: row.role.revision,
      members: row.members,
      stored: true,
      updatedAt: row.role.updatedAt,
    }));
  return { builtins, custom };
}

/** People who hold a permission today, through an assigned role or a built-in default. */
async function holdersOf(db: Executor, permission: Permission) {
  const rows = await db
    .select({
      role: users.role,
      permissions: accessRoles.permissions,
      baseRole: accessRoles.baseRole,
      assigned: userAccessRoles.userId,
      builtin: sql<Role | null>`(select r.builtin_role from ${accessRoles} r where r.builtin_role = ${users.role})`,
      builtinPermissions: sql<
        Permission[] | null
      >`(select r.permissions from ${accessRoles} r where r.builtin_role = ${users.role})`,
    })
    .from(users)
    .leftJoin(userAccessRoles, eq(userAccessRoles.userId, users.id))
    .leftJoin(accessRoles, eq(accessRoles.id, userAccessRoles.accessRoleId))
    .where(eq(users.isActive, true));
  return rows.filter((row) => {
    if (row.assigned && row.permissions)
      return row.baseRole === row.role && row.permissions.includes(permission);
    const defaults = row.builtinPermissions ?? ROLE_PERMISSIONS[row.role];
    return defaults.includes(permission);
  }).length;
}

/** What a change recorded, narrowed from the jsonb so clients get a stable shape. */
export type AccessChangeDetail = {
  name?: string | null;
  baseRole?: Role;
  permissions?: Permission[];
  accessRoleId?: string | null;
};

async function record(
  db: Executor,
  actorId: string,
  action: string,
  targetId: string,
  before: AccessChangeDetail | null,
  after: AccessChangeDetail,
) {
  await db
    .insert(accessChanges)
    .values({ actorId, action, targetId, before, after });
}

export async function saveAccessRole(
  db: Database,
  input: SaveAccessRoleInput,
  actor: Actor,
  options: { builtinRole?: Role } = {},
) {
  const { refused } = grantable(actor.permissions, input.permissions);
  if (refused.length > 0)
    throw new ManagementError("FORBIDDEN", "access.escalation");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(741904)`);
    const existing = await tx.query.accessRoles.findFirst({
      where: { id: input.id },
    });
    const builtinRole = existing?.builtinRole ?? options.builtinRole ?? null;
    if (existing && existing.revision !== input.expectedRevision)
      throw new ManagementError("CONFLICT", "access.revision_conflict");
    if (!existing && input.expectedRevision !== 0)
      throw new ManagementError("NOT_FOUND", "access.not_found");
    if (existing && existing.baseRole !== input.baseRole)
      throw new ManagementError("BAD_REQUEST", "access.base_role_fixed");
    if (builtinRole && builtinRole !== input.baseRole)
      throw new ManagementError("BAD_REQUEST", "access.base_role_fixed");
    const before =
      existing?.permissions ??
      (builtinRole ? ROLE_PERMISSIONS[builtinRole] : []);
    if (
      withdrawn(before, input.permissions).includes(ACCESS_ADMIN_PERMISSION)
    ) {
      const holders = await holdersOf(tx, ACCESS_ADMIN_PERMISSION);
      const affected = existing
        ? await tx
            .select({ n: count() })
            .from(userAccessRoles)
            .where(eq(userAccessRoles.accessRoleId, existing.id))
        : [];
      const throughRole = existing
        ? (affected[0]?.n ?? 0)
        : await countUsersOnDefault(tx, builtinRole);
      if (holders - throughRole <= 0)
        throw new ManagementError("BAD_REQUEST", "access.last_administrator");
    }
    const values = {
      name: input.name,
      baseRole: input.baseRole,
      builtinRole,
      permissions: input.permissions,
    };
    const [saved] = existing
      ? await tx
          .update(accessRoles)
          .set({
            ...values,
            revision: existing.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(accessRoles.id, existing.id))
          .returning()
      : await tx
          .insert(accessRoles)
          .values({ id: input.id, ...values })
          .returning();
    if (!saved)
      throw new ManagementError("CONFLICT", "access.revision_conflict");
    await record(
      tx,
      actor.id,
      existing ? "role.updated" : "role.created",
      saved.id,
      existing
        ? { name: existing.name, permissions: existing.permissions }
        : builtinRole
          ? { name: null, permissions: ROLE_PERMISSIONS[builtinRole] }
          : null,
      {
        name: saved.name,
        baseRole: saved.baseRole,
        permissions: saved.permissions,
      },
    );
    return { id: saved.id, revision: saved.revision };
  });
}

/** Active people on a built-in role with no explicit assignment. */
async function countUsersOnDefault(db: Executor, builtinRole: Role | null) {
  if (!builtinRole) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .leftJoin(userAccessRoles, eq(userAccessRoles.userId, users.id))
    .where(
      and(
        eq(users.role, builtinRole),
        eq(users.isActive, true),
        isNull(userAccessRoles.userId),
      ),
    );
  return row?.n ?? 0;
}

export async function assignAccessRole(
  db: Database,
  input: AssignAccessRoleInput,
  actor: Actor,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(741904)`);
    const target = await tx.query.users.findFirst({
      where: { id: input.userId },
      columns: { id: true, name: true, role: true, isActive: true },
    });
    if (!target)
      throw new ManagementError("NOT_FOUND", "access.user_not_found");
    const current = await tx.query.userAccessRoles.findFirst({
      where: { userId: input.userId },
    });
    if ((current?.revision ?? 0) !== input.expectedRevision)
      throw new ManagementError("CONFLICT", "access.revision_conflict");
    let nextPermissions: readonly Permission[] = ROLE_PERMISSIONS[target.role];
    if (input.accessRoleId) {
      const role = await tx.query.accessRoles.findFirst({
        where: { id: input.accessRoleId },
      });
      if (!role) throw new ManagementError("NOT_FOUND", "access.not_found");
      if (!roleFitsBase(role.baseRole, target.role))
        throw new ManagementError("BAD_REQUEST", "access.base_role_mismatch");
      const { refused } = grantable(actor.permissions, role.permissions);
      if (refused.length > 0)
        throw new ManagementError("FORBIDDEN", "access.escalation");
      nextPermissions = role.permissions;
    } else {
      const builtin = await tx.query.accessRoles.findFirst({
        where: { builtinRole: target.role },
      });
      nextPermissions = builtin?.permissions ?? ROLE_PERMISSIONS[target.role];
    }
    const previous = await effectiveAccess(tx, target);
    if (
      previous.permissions.includes(ACCESS_ADMIN_PERMISSION) &&
      !nextPermissions.includes(ACCESS_ADMIN_PERMISSION)
    ) {
      if (target.id === actor.id)
        throw new ManagementError("BAD_REQUEST", "access.self_lockout");
      const holders = await holdersOf(tx, ACCESS_ADMIN_PERMISSION);
      if (holders <= 1)
        throw new ManagementError("BAD_REQUEST", "access.last_administrator");
    }
    let revision = 0;
    if (input.accessRoleId) {
      const [saved] = await tx
        .insert(userAccessRoles)
        .values({ userId: target.id, accessRoleId: input.accessRoleId })
        .onConflictDoUpdate({
          target: userAccessRoles.userId,
          set: {
            accessRoleId: input.accessRoleId,
            revision: (current?.revision ?? 0) + 1,
            updatedAt: new Date(),
          },
        })
        .returning({ revision: userAccessRoles.revision });
      revision = saved?.revision ?? 1;
    } else if (current) {
      await tx
        .delete(userAccessRoles)
        .where(eq(userAccessRoles.userId, target.id));
    }
    await record(
      tx,
      actor.id,
      "assignment.changed",
      target.id,
      { name: target.name, accessRoleId: current?.accessRoleId ?? null },
      { name: target.name, accessRoleId: input.accessRoleId },
    );
    return { userId: target.id, accessRoleId: input.accessRoleId, revision };
  });
}

export async function userAccess(db: Database, userId: string) {
  const current = await db.query.userAccessRoles.findFirst({
    where: { userId },
    columns: { accessRoleId: true, revision: true },
  });
  return {
    accessRoleId: current?.accessRoleId ?? null,
    revision: current?.revision ?? 0,
  };
}

export async function listAccessChanges(db: Database, requestedPage: number) {
  const [totals] = await db.select({ total: count() }).from(accessChanges);
  const total = totals?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const page = Math.min(requestedPage, pages);
  const rows = await db
    .select({
      id: accessChanges.id,
      action: accessChanges.action,
      targetId: accessChanges.targetId,
      before: accessChanges.before,
      after: accessChanges.after,
      createdAt: accessChanges.createdAt,
      actor: { id: users.id, name: users.name },
    })
    .from(accessChanges)
    .innerJoin(users, eq(users.id, accessChanges.actorId))
    .orderBy(desc(accessChanges.createdAt), desc(accessChanges.id))
    .limit(25)
    .offset((page - 1) * 25);
  return {
    rows: rows.map((row) => ({
      ...row,
      before: row.before as AccessChangeDetail | null,
      after: row.after as AccessChangeDetail,
    })),
    total,
    pages,
    page,
  };
}
