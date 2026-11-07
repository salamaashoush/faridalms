import { holdOf } from "@faridalms/database/stores/holds";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

/**
 * Refuses a save to a record's document while someone else holds it, so
 * an editor that was taken over learns it on its next save rather than
 * writing over the person who took it.
 */
export async function refuseIfHeld(
  context: UnitContext,
  host: { type: string; id: string },
) {
  const hold = await holdOf(context.tx, context.tenantId, host);
  if (hold && hold.userId !== context.actor.userId)
    throw new ORPCError("CONFLICT", { message: "documents.held" });
}
