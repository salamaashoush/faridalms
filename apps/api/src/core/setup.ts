import type { OnboardingItem } from "@faridalms/domain/onboarding";

import { onboardingSeen } from "@faridalms/database/stores/onboarding";

import type { ModuleScope } from "./extension";

import { contributionsTo, point } from "./extension";

/** A setup step a module measures from its own records. */
export interface SetupMeasure {
  item: OnboardingItem;
  seen(scope: ModuleScope, today: string): Promise<boolean>;
}

export const setupMeasures = point<SetupMeasure>("setup measures");

/** The setup steps the cell sees a school has taken, core's and each module's on. */
export async function setupSeen(
  scope: ModuleScope,
  today: string,
): Promise<OnboardingItem[]> {
  const [own, measures] = await Promise.all([
    onboardingSeen(scope.tx, {
      tenantId: scope.tenantId,
      orgId: scope.schoolId,
    }),
    contributionsTo(scope, setupMeasures),
  ]);
  const seen = await Promise.all(
    measures.map(async (measure) =>
      (await measure.seen(scope, today)) ? [measure.item] : [],
    ),
  );
  return [...own, ...seen.flat()];
}
