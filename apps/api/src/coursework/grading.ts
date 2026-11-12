import { classById } from "@faridalms/database/stores/classes";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { can, requireCapability } from "../core/procedure";

export function refuse(message: string): never {
  throw new ORPCError("BAD_REQUEST", { message });
}

export function scopeOf(context: UnitContext) {
  return { tenantId: context.tenantId, orgId: context.schoolId };
}

/** Those who set up grading keep scales and programmes; office staff place classes in them. */
export function requireReader(context: UnitContext) {
  if (!can(context, "grading:manage"))
    requireCapability(context, "classes:manage");
}

/** A class of the school, or not found. */
export async function schoolClass(context: UnitContext, classId: string) {
  const row = await classById(context.tx, context, classId);
  if (!row) throw new ORPCError("NOT_FOUND");
  return row;
}
