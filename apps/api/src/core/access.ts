import type { Capability } from "@faridalms/domain/capabilities";

import {
  accessManagerCount,
  lockAccess,
} from "@faridalms/database/stores/access";
import { CAPABILITIES } from "@faridalms/domain/capabilities";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

/**
 * Runs a write that can change who holds a capability, then refuses it when
 * nobody would be left holding access:manage. The lock makes two such writes
 * take turns, so two administrators removing each other cannot both succeed.
 */
export async function guardingAccess<T>(
  context: UnitContext,
  write: () => Promise<T>,
): Promise<T> {
  await lockAccess(context.tx);
  const result = await write();
  if (
    (await accessManagerCount(context.tx, context.tenantId, context.today)) ===
    0
  )
    throw new ORPCError("CONFLICT", { message: "access.last_manager" });
  return result;
}

/** What the actor may grant: only capabilities they hold themselves. */
export function grantable(context: UnitContext): Capability[] {
  return CAPABILITIES.filter((capability) =>
    context.actor.capabilities.has(capability),
  );
}

export function requireGrantable(
  context: UnitContext,
  capabilities: readonly string[],
) {
  const held = new Set<string>(grantable(context));
  if (capabilities.some((capability) => !held.has(capability)))
    throw new ORPCError("FORBIDDEN", { message: "access.not_held" });
}
