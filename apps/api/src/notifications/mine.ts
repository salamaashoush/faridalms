import { wordOn } from "@faridalms/domain/modules";
import { NOTIFICATION_KINDS } from "@faridalms/domain/notifications";

import type { UnitContext } from "../core/context";

import { modulesOf } from "../core/modules";

/**
 * The viewer's own notifications at the school, leaving out the kinds of
 * modules that are off: their notices are kept and show again once the
 * module is back on.
 */
export async function mine(context: UnitContext) {
  const on = await modulesOf(context);
  return {
    tenantId: context.tenantId,
    userId: context.actor.userId,
    orgId: context.schoolId,
    hidden: NOTIFICATION_KINDS.filter((kind) => !wordOn("notices", kind, on)),
  };
}
