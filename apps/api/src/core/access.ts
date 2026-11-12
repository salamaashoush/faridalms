import type { Capability } from "@faridalms/domain/capabilities";

import {
  accessManagerCount,
  lockAccess,
} from "@faridalms/database/stores/access";
import { effectiveAccess } from "@faridalms/database/stores/identity";
import { CAPABILITIES } from "@faridalms/domain/capabilities";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

/**
 * Runs a write that can change who holds a capability, then refuses it when
 * nobody would be left holding access:manage, or when the actor would lose
 * it themselves. The lock makes two such writes take turns, so two
 * administrators removing each other cannot both succeed.
 */
export async function guardingAccess<T>(
  context: UnitContext,
  write: () => Promise<T>,
): Promise<T> {
  await lockAccess(context.tx);
  const managing = () =>
    accessManagerCount(
      context.tx,
      context.tenantId,
      context.today,
      context.actor.userId,
    );
  const managedBefore = (await managing()) > 0;
  const result = await write();
  if (
    (await accessManagerCount(context.tx, context.tenantId, context.today)) ===
    0
  )
    throw new ORPCError("CONFLICT", { message: "access.last_manager" });
  if (managedBefore && (await managing()) === 0)
    throw new ORPCError("CONFLICT", { message: "access.self_lockout" });
  return result;
}

/**
 * What the actor may grant: only capabilities their roles hold, those of a
 * module that is off included, so a role keeps what it holds while the
 * module is off and is given again what it held.
 */
export async function grantable(context: UnitContext): Promise<Capability[]> {
  const held = await effectiveAccess(context.tx, {
    tenantId: context.tenantId,
    userId: context.actor.userId,
    orgId: context.schoolId,
    today: context.today,
    context: context.actor.context,
    young: false,
  });
  return CAPABILITIES.filter((capability) => held.capabilities.has(capability));
}

export async function requireGrantable(
  context: UnitContext,
  capabilities: readonly string[],
) {
  const held = new Set<string>(await grantable(context));
  if (capabilities.some((capability) => !held.has(capability)))
    throw new ORPCError("FORBIDDEN", { message: "access.not_held" });
}
