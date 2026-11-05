import {
  accessChanges,
  assignmentsOf,
  endAssignment,
  insertAccessRole,
  insertAssignment,
  rolesForSchool,
  updateAccessRole,
} from "@faridalms/database/stores/access";
import { effectiveAccess } from "@faridalms/database/stores/identity";
import { CAPABILITIES } from "@faridalms/domain/capabilities";
import { paged, pageWindow } from "@faridalms/domain/paging";
import {
  accessChangesSchema,
  assignAccessRoleSchema,
  endAccessAssignmentSchema,
  saveAccessRoleSchema,
} from "@faridalms/domain/people";
import { addDays } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { grantable, guardingAccess, requireGrantable } from "../core/access";
import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { requirePerson } from "../core/reach";

const id = v.pipe(v.string(), v.uuid());

function scopeOf(context: UnitContext) {
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
  };
}

function roleScope(
  orgId: string | null,
  schoolId: string,
): "tenant" | "school" | "group" {
  if (orgId === null) return "tenant";
  return orgId === schoolId ? "school" : "group";
}

async function requireReached(context: UnitContext, userId: string) {
  await requirePerson(context, "school", userId);
}

async function visibleRole(context: UnitContext, roleId: string) {
  const role = (await rolesForSchool(context.tx, scopeOf(context))).find(
    (row) => row.id === roleId,
  );
  if (!role) throw new ORPCError("NOT_FOUND");
  return role;
}

export const roles = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "access:manage");
  const rows = await rolesForSchool(context.tx, scopeOf(context));
  return {
    roles: rows.map((row) => ({
      ...row,
      capabilities: CAPABILITIES.filter((capability) =>
        row.capabilities.includes(capability),
      ),
      scope: roleScope(row.orgId, context.schoolId),
      // Built-ins are edited as this school's override; custom roles only
      // where they were made.
      editable: row.builtinKey !== null || row.orgId === context.schoolId,
    })),
    grantable: grantable(context),
  };
});

export const saveRole = writeProcedure
  .input(saveAccessRoleSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "access:manage");
    requireGrantable(context, input.capabilities);
    if (!input.nameEn && !input.nameAr)
      throw new ORPCError("BAD_REQUEST", {
        message: "validation.name_required",
      });
    const fields = {
      nameEn: input.nameEn,
      nameAr: input.nameAr,
      descriptionEn: input.descriptionEn,
      descriptionAr: input.descriptionAr,
      capabilities: [...input.capabilities],
    };
    return guardingAccess(context, async () => {
      if (!input.id) {
        const created = await insertAccessRole(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          builtinKey: null,
          ...fields,
        });
        await audit(context, {
          action: "access_role.create",
          objectType: "access_role",
          objectId: created.id,
          details: { capabilities: fields.capabilities },
        });
        return created;
      }
      const role = await visibleRole(context, input.id);
      if (role.builtinKey && role.orgId !== context.schoolId) {
        const created = await insertAccessRole(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          builtinKey: role.builtinKey,
          ...fields,
        });
        await audit(context, {
          action: "access_role.override",
          objectType: "access_role",
          objectId: created.id,
          details: {
            builtinKey: role.builtinKey,
            before: role.capabilities,
            capabilities: fields.capabilities,
          },
        });
        return created;
      }
      if (role.orgId !== context.schoolId)
        throw new ORPCError("FORBIDDEN", { message: "access_role.other_org" });
      const saved = await updateAccessRole(context.tx, {
        tenantId: context.tenantId,
        id: role.id,
        expectedVersion: input.expectedVersion ?? 0,
        ...fields,
      });
      if (!saved)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      await audit(context, {
        action: "access_role.update",
        objectType: "access_role",
        objectId: role.id,
        details: {
          before: role.capabilities,
          capabilities: fields.capabilities,
        },
      });
      return saved;
    });
  });

/** A person's access at this school: what they hold today and which assignments give it. */
export const personAccess = readProcedure
  .input(v.object({ userId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "access:manage");
    await requireReached(context, input.userId);
    const [access, assignments] = await Promise.all([
      effectiveAccess(context.tx, {
        tenantId: context.tenantId,
        userId: input.userId,
        orgId: context.schoolId,
        today: context.today,
        context: "staff",
      }),
      assignmentsOf(context.tx, scopeOf(context), input.userId),
    ]);
    return {
      capabilities: CAPABILITIES.filter((capability) =>
        access.capabilities.has(capability),
      ),
      assignments,
    };
  });

export const assign = writeProcedure
  .input(assignAccessRoleSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "access:manage");
    await requireReached(context, input.userId);
    const role = await visibleRole(context, input.accessRoleId);
    requireGrantable(context, role.capabilities);
    const from = input.startsOn ?? context.today;
    if (input.endsOn && input.endsOn < from)
      throw new ORPCError("BAD_REQUEST", { message: "validation.end_date" });
    // The role is held through the day it ends on.
    const to = input.endsOn ? addDays(input.endsOn, 1) : null;
    const assignmentId = await guardingAccess(context, () =>
      insertAssignment(context.tx, {
        tenantId: context.tenantId,
        userId: input.userId,
        accessRoleId: role.id,
        orgId: context.schoolId,
        from,
        to,
        replacesBuiltin: input.replacesBuiltin,
        grantedByUserId: context.actor.userId,
        reason: input.reason,
      }),
    );
    await audit(context, {
      action: "access_assignment.create",
      objectType: "access_role_assignment",
      objectId: assignmentId,
      subjectUserId: input.userId,
      details: {
        accessRoleId: role.id,
        from,
        to,
        replacesBuiltin: input.replacesBuiltin,
      },
    });
    return { id: assignmentId };
  });

export const endAssignmentOf = writeProcedure
  .input(endAccessAssignmentSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "access:manage");
    const userId = await guardingAccess(context, () =>
      endAssignment(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        id: input.assignmentId,
        expectedVersion: input.expectedVersion,
        today: context.today,
      }),
    );
    if (!userId)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "access_assignment.end",
      objectType: "access_role_assignment",
      objectId: input.assignmentId,
      subjectUserId: userId,
    });
    return { ended: true };
  });

export const changes = readProcedure
  .input(accessChangesSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "access:manage", "audit:read");
    const { rows, total } = await accessChanges(
      context.tx,
      context.tenantId,
      pageWindow(input.page),
    );
    return paged(rows, total, input.page);
  });
