import type { Feature } from "@faridalms/domain/features";

import { schoolFeatures } from "@faridalms/database/stores/identity";
import { FEATURES } from "@faridalms/domain/features";
import { availableModules } from "@faridalms/domain/plans";

import type { UnitContext } from "./context";

/**
 * What a school has on: a module its administrators switched on that its plan
 * also includes. A module the plan drops is off, keeping its switch for when
 * the plan includes it again.
 */
export async function featuresOf(
  context: UnitContext,
): Promise<Record<Feature, boolean>> {
  const switched = await schoolFeatures(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  const available = new Set<string>(availableModules(context.school.plan));
  return Object.fromEntries(
    FEATURES.map((feature) => [
      feature,
      switched[feature] && available.has(feature),
    ]),
  ) as Record<Feature, boolean>;
}
