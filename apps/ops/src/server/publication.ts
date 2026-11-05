import type { BusinessDb } from "@faridalms/database/business/client";
import type {
  DirectoryAdmin,
  OperatorSchool,
} from "@faridalms/database/directory/admin";
import type { EntitlementsInput } from "@faridalms/domain/plans";

import { lastEvent, recordEvent } from "@faridalms/database/business/events";
import {
  grandfatherTenant,
  openSubscriptions,
  recordPublication,
  subscriptionDetail,
  termsOf,
} from "@faridalms/database/business/subscriptions";
import { settableOf } from "@faridalms/domain/plans";
import { entitlementsFor, trialOver } from "@faridalms/domain/subscriptions";
import { sql } from "drizzle-orm";
import * as v from "valibot";

/**
 * The operator id the console's own daily round acts under, in the business
 * log and, as `operator:console-daily`, in the directory's.
 */
export const SYSTEM_OPERATOR = "console-daily";

export interface Publishing {
  business: BusinessDb;
  directory: DirectoryAdmin;
  /**
   * Makes a tenant read only through its cell, as the Access section does;
   * false when the cell refused or could not be reached.
   */
  pauseTenant: (tenantId: string, reason: string) => Promise<boolean>;
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

function tenantsOf(schools: readonly OperatorSchool[]) {
  const tenants = new Map<string, OperatorSchool[]>();
  for (const school of schools)
    if (school.placement === "cell" && school.tenantState !== "provisioning")
      tenants.set(school.tenantId, [
        ...(tenants.get(school.tenantId) ?? []),
        school,
      ]);
  return tenants;
}

export const ROUND_ACTION = "daily.round";

const roundOutcomeSchema = v.object({
  day: v.pipe(v.string(), v.isoDate()),
  grandfathered: v.number(),
  published: v.number(),
  /** Tenants whose trial ended without a contract, now read only. */
  paused: v.number(),
  /** Subscriptions the round could not publish or pause, to look at. */
  failed: v.array(v.string()),
});
export type RoundOutcome = v.InferOutput<typeof roundOutcomeSchema>;

/** The last round's outcome, as its event recorded it. */
export async function lastRound(
  db: BusinessDb,
): Promise<{ at: Date; by: string; outcome: RoundOutcome } | null> {
  const last = await lastEvent(db, ROUND_ACTION);
  if (!last) return null;
  const outcome = v.safeParse(roundOutcomeSchema, last.after);
  return outcome.success
    ? { at: last.occurredAt, by: last.operatorId, outcome: outcome.output }
    : null;
}

/** Whether the round has not yet run for the day. */
export async function roundDue(db: BusinessDb, day: string): Promise<boolean> {
  const last = await lastRound(db);
  return !last || last.outcome.day < day;
}

/**
 * The console's daily round. Every tenant without a subscription is given a
 * grandfathered one that keeps what its schools have; every open
 * subscription is published again, so items and overrides that began or
 * ended today reach the cells; and a tenant whose trial is over without a
 * contract becomes read only. One subscription's failure is recorded and
 * the rest go on. Only one console runs it at a time: null when another is.
 */
export async function dailyRound(
  deps: Publishing,
  day: string,
  by = SYSTEM_OPERATOR,
): Promise<RoundOutcome | null> {
  return deps.business.transaction(async (tx) => {
    const [locked] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended('daily_round', 0)) as locked`,
    );
    if (!locked?.locked) return null;
    const outcome: RoundOutcome = {
      day,
      grandfathered: 0,
      published: 0,
      paused: 0,
      failed: [],
    };
    const tenants = tenantsOf(await deps.directory.schools());
    for (const [tenantId, schools] of tenants) {
      const [first] = schools;
      if (!first) continue;
      const country = first.tenantJurisdictions[0] ?? "EG";
      const created = await grandfatherTenant(deps.business, {
        tenantId,
        legalNameEn:
          first.tenantNameEn ??
          first.tenantNameAr ??
          first.nameEn ??
          first.slug,
        legalNameAr: first.tenantNameAr ?? first.nameAr,
        country,
        currency: country === "EG" ? "EGP" : "USD",
        schools: schools.map((school) => ({
          schoolId: school.id,
          entitlements: settableOf(school.entitlements),
        })),
        day,
        by,
      });
      if (created) outcome.grandfathered += 1;
    }
    for (const subscription of await openSubscriptions(deps.business)) {
      try {
        const out = await publishSubscription(deps, {
          subscriptionId: subscription.id,
          day,
          by,
          reason: "Daily: what began or ended today",
        });
        outcome.published += out.published.length;
        const [school] = tenants.get(subscription.tenantId) ?? [];
        if (trialOver(subscription, day) && school?.tenantState === "active") {
          const paused = await deps.pauseTenant(
            subscription.tenantId,
            `The trial ended on ${subscription.trialEndsOn} without a contract`,
          );
          if (!paused) throw new Error(`pause refused for ${subscription.id}`);
          outcome.paused += 1;
        }
      } catch (error) {
        console.error(
          JSON.stringify({
            worker: "daily_round",
            subscriptionId: subscription.id,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        outcome.failed.push(subscription.id);
      }
    }
    await recordEvent(tx, {
      operatorId: by,
      action: ROUND_ACTION,
      subjectType: "round",
      subjectId: day,
      after: outcome,
    });
    return outcome;
  });
}
