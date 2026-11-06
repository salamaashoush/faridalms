import type { BusinessDb } from "@faridalms/database/business/client";
import type {
  DirectoryAdmin,
  OperatorSchool,
} from "@faridalms/database/directory/admin";
import type {
  HealthLevel,
  HealthReason,
  OnboardingItem,
} from "@faridalms/domain/onboarding";

import { owedInvoices } from "@faridalms/database/business/dunning";
import {
  healthOf,
  onboardingItems,
  onboardingStalled,
} from "@faridalms/domain/onboarding";
import { availableModules } from "@faridalms/domain/plans";
import { daysBetween } from "@faridalms/domain/school";

export interface SchoolHealth {
  level: HealthLevel;
  reasons: HealthReason[];
  /** The longest any of its customer's invoices has run past due, in days. */
  daysOverdue: number;
  onboarding: {
    applies: OnboardingItem[];
    /** When each step was first taken, and by which operator when one ticked it. */
    reached: Partial<
      Record<OnboardingItem, { at: string; operatorId: string | null }>
    >;
    stalled: boolean;
  };
}

/**
 * Each school's onboarding and health, from the directory's steps, usage and
 * hosts, and from the business's unpaid invoices where it has them.
 */
export async function schoolHealth(
  deps: { directory: DirectoryAdmin; business: BusinessDb | null },
  schools: readonly OperatorSchool[],
  now: Date,
  today: string,
): Promise<Map<string, SchoolHealth>> {
  const [steps, failing, owed] = await Promise.all([
    deps.directory.onboarding(),
    deps.directory.failingHosts(),
    deps.business ? owedInvoices(deps.business) : Promise.resolve([]),
  ]);
  const overdue = new Map<string, number>();
  for (const row of owed) {
    if (!row.tenantId) continue;
    const days = daysBetween(row.dueOn, today) - 1;
    overdue.set(row.tenantId, Math.max(overdue.get(row.tenantId) ?? 0, days));
  }
  const out = new Map<string, SchoolHealth>();
  for (const school of schools) {
    const reached: SchoolHealth["onboarding"]["reached"] = {};
    for (const step of steps)
      if (step.schoolId === school.id)
        reached[step.item] = {
          at: step.reachedAt.toISOString(),
          operatorId: step.operatorId,
        };
    const applies = onboardingItems({
      modules: availableModules(school.entitlements),
      onTrial: school.entitlements.trialEndsOn !== null,
    });
    const stalled = onboardingStalled({
      applies,
      reached: new Map(
        Object.entries(reached).map(([item, step]) => [
          item as OnboardingItem,
          new Date(step.at),
        ]),
      ),
      createdAt: new Date(school.createdAt),
      now,
    });
    const daysOverdue = Math.max(overdue.get(school.tenantId) ?? 0, 0);
    const health = healthOf({
      signedIn7d: school.usage?.signedIn7d ?? null,
      schoolDays7d: school.usage?.schoolDays7d ?? null,
      daysOverdue,
      onboardingStalled: stalled,
      hostFailing: failing.has(school.id),
      failedDeliveries1d: school.usage?.failedDeliveries1d ?? null,
    });
    out.set(school.id, {
      ...health,
      daysOverdue,
      onboarding: { applies, reached, stalled },
    });
  }
  return out;
}
