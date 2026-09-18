import * as repo from "@faridalms/database/repositories/access";
import { ManagementError } from "@faridalms/database/repositories/management";
import {
  accessChangesQuerySchema,
  assignAccessRoleSchema,
  saveAccessRoleSchema,
} from "@faridalms/domain/access";
import { ROLES } from "@faridalms/domain/identity";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import { requirePermission } from "../authorization";
import { protectedProcedure } from "../procedure";

async function managed<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ManagementError)
      throw new ORPCError(error.code, { message: error.message });
    throw error;
  }
}

/** Roles the school can assign, plus what the caller may grant. */
export const getAccessRoles = protectedProcedure.handler(
  async ({ context }) => {
    const user = await requirePermission(context, "access:manage");
    return {
      ...(await repo.listAccessRoles(context.db)),
      grantable: user.permissions,
    };
  },
);

export const saveAccessRole = protectedProcedure
  .input(
    v.object({
      ...saveAccessRoleSchema.entries,
      builtinRole: v.optional(v.nullable(v.picklist(ROLES)), null),
    }),
  )
  .handler(async ({ context, input }) => {
    const user = await requirePermission(context, "access:manage");
    const { builtinRole, ...role } = input;
    return managed(() =>
      repo.saveAccessRole(
        context.db,
        role,
        { id: user.id, permissions: user.permissions },
        { builtinRole: builtinRole ?? undefined },
      ),
    );
  });

export const assignAccessRole = protectedProcedure
  .input(assignAccessRoleSchema)
  .handler(async ({ context, input }) => {
    const user = await requirePermission(context, "access:manage");
    return managed(() =>
      repo.assignAccessRole(context.db, input, {
        id: user.id,
        permissions: user.permissions,
      }),
    );
  });

export const getUserAccess = protectedProcedure
  .input(v.object({ userId: v.pipe(v.string(), v.uuid()) }))
  .handler(async ({ context, input }) => {
    await requirePermission(context, "access:manage");
    return repo.userAccess(context.db, input.userId);
  });

export const getAccessChanges = protectedProcedure
  .input(accessChangesQuerySchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "access:manage");
    return repo.listAccessChanges(context.db, input.page);
  });
