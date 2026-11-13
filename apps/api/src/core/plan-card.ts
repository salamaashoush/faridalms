import type { ModuleId } from "@faridalms/domain/modules";

import { schoolFeatures } from "@faridalms/database/stores/identity";
import { availableModules } from "@faridalms/domain/plans";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

/**
 * What a school's plan card shows: its switches, the modules its plan lets
 * it switch on, the modules on offer to schools that lack them, and whether
 * its administrators can ask about one.
 */
export async function planCard(context: UnitContext) {
  return {
    switches: await schoolFeatures(
      context.tx,
      context.tenantId,
      context.schoolId,
    ),
    available: availableModules(context.school.entitlements),
    offered: await context.directory.offered(),
    canAsk: Boolean(context.intake),
  };
}

/** Refuses a question about a module the school has, or one not on offer. */
export async function requireAskable(context: UnitContext, module: ModuleId) {
  if (availableModules(context.school.entitlements).includes(module))
    throw new ORPCError("CONFLICT", { message: "module.in_plan" });
  if (!(await context.directory.offered()).includes(module))
    throw new ORPCError("FORBIDDEN", { message: "module.not_offered" });
}
