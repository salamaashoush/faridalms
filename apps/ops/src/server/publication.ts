import type { BusinessDb } from "@faridalms/database/business/client";
import type { DirectoryAdmin } from "@faridalms/database/directory/admin";
import type { EntitlementsInput } from "@faridalms/domain/plans";
import type {
  SchoolStanding,
  TenantCalendar,
} from "@faridalms/domain/provisioning";
import type { Provider } from "@faridalms/mail/providers";

import {
  recordPublication,
  subscriptionDetail,
  termsOf,
} from "@faridalms/database/business/subscriptions";
import { settableOf } from "@faridalms/domain/plans";
import { entitlementsFor } from "@faridalms/domain/subscriptions";

/**
 * The operator id the console's own daily round acts under, in the business
 * log and, as `operator:console-daily`, in the directory's.
 */
export const SYSTEM_OPERATOR = "console-daily";

export interface Publishing {
  business: BusinessDb;
  directory: DirectoryAdmin;
  /**
   * Moves a tenant to a standing through its cell, as the Access section
   * does; false when the cell refused or could not be reached.
   */
  setStanding: (
    tenantId: string,
    standing: SchoolStanding,
    reason: string,
  ) => Promise<boolean>;
  /** When the tenant's schools have their weekend; null when its cell could not say. */
  calendar: (tenantId: string) => Promise<TenantCalendar["schools"] | null>;
  /** Where the clock's emails go out; null when the console has no mail set up. */
  mail: Provider | null;
  now: () => Date;
  /**
   * Tells the tenant's cell its entitlements changed, so its servers read
   * them at once; false when it could not, and they read them within the
   * directory cache's minute.
   */
  entitlementsChanged: (tenantId: string) => Promise<boolean>;
}

/** Whether two entitlements say the same, field by field, whatever their key order. */
function same(a: EntitlementsInput, b: EntitlementsInput): boolean {
  const keys = Object.keys(a) as (keyof EntitlementsInput)[];
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]))
  );
}

/** What each of a subscription's schools is entitled to on the day. */
export async function previewSubscription(
  deps: Pick<Publishing, "business" | "directory">,
  subscriptionId: string,
  day: string,
) {
  const detail = await subscriptionDetail(deps.business, subscriptionId);
  if (!detail) return null;
  const schools = (await deps.directory.schools()).filter(
    (school) => school.tenantId === detail.subscription.tenantId,
  );
  const terms = termsOf(detail);
  return {
    detail,
    schools: schools.map((school) => ({
      school,
      current: settableOf(school.entitlements),
      next: entitlementsFor({
        schoolId: school.id,
        day,
        ...terms,
        trialEndsOn:
          detail.subscription.state === "trial"
            ? detail.subscription.trialEndsOn
            : null,
        notice: detail.subscription.notice,
      }),
    })),
  };
}

/**
 * Writes a subscription's result to the directory for every school whose
 * entitlements it changes, records each publication, then tells the
 * tenant's cell. The directory is written first: a publication is only
 * recorded for what cells will read.
 */
export async function publishSubscription(
  deps: Pick<Publishing, "business" | "directory" | "entitlementsChanged">,
  input: { subscriptionId: string; day: string; by: string; reason: string },
): Promise<{ published: string[]; atOnce: boolean }> {
  const preview = await previewSubscription(
    deps,
    input.subscriptionId,
    input.day,
  );
  if (!preview) throw new Error("NOT_FOUND");
  const published: string[] = [];
  for (const { school, current, next } of preview.schools) {
    if (same(current, next)) continue;
    await deps.directory.saveEntitlements({
      schoolId: school.id,
      entitlements: next,
      operatorId: input.by,
      reason: input.reason,
    });
    await recordPublication(deps.business, {
      subscriptionId: input.subscriptionId,
      schoolId: school.id,
      revision: preview.detail.subscription.revision,
      entitlements: next,
      by: input.by,
      reason: input.reason,
    });
    published.push(school.id);
  }
  const atOnce =
    published.length > 0 &&
    (await deps.entitlementsChanged(preview.detail.subscription.tenantId));
  return { published, atOnce };
}
