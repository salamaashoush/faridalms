import type { ModuleId } from "@faridalms/domain/modules";

import { schoolFeatures } from "@faridalms/database/stores/identity";
import { modulesOn, SWITCHED_MODULES } from "@faridalms/domain/modules";
import { availableModules } from "@faridalms/domain/plans";

import type { UnitContext } from "./context";

const settled = new WeakMap<UnitContext, Promise<Record<ModuleId, boolean>>>();

/**
 * What a school has on: modules its plan includes, with what each needs on,
 * and those the school switches itself switched on. A module the plan drops
 * is off, keeping the school's switch for when the plan includes it again.
 * Read once per unit of work.
 */
export function modulesOf(
  context: UnitContext,
): Promise<Record<ModuleId, boolean>> {
  let found = settled.get(context);
  if (!found) {
    found = (async () => {
      const switched = await schoolFeatures(
        context.tx,
        context.tenantId,
        context.schoolId,
      );
      const entitled = new Set<string>(
        availableModules(context.school.entitlements),
      );
      return modulesOn({
        entitled: (id) => entitled.has(id),
        switchedOn: (id) =>
          (SWITCHED_MODULES as readonly string[]).includes(id) &&
          switched[id as keyof typeof switched],
      });
    })();
    settled.set(context, found);
  }
  return found;
}
