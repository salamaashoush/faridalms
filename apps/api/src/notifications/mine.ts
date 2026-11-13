import { wordOn } from "@faridalms/domain/modules";
import { NOTIFICATION_KINDS } from "@faridalms/domain/notifications";

import type { UnitContext } from "../core/context";

import { modulesOf } from "../core/modules";
import { readerOf } from "../messages/standing";

/**
 * The viewer's own notifications at the school, leaving out the kinds of
 * modules that are off and those about a conversation the viewer no longer
 * reads: they are kept and show again once the module is back on or the
 * standing returns.
 */
export async function mine(context: UnitContext) {
  const [on, reader] = await Promise.all([
    modulesOf(context),
    readerOf(context),
  ]);
  return {
    reader,
    tenantId: context.tenantId,
    userId: context.actor.userId,
    orgId: context.schoolId,
    hidden: NOTIFICATION_KINDS.filter((kind) => !wordOn("notices", kind, on)),
  };
}
