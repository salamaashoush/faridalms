import type { BusinessDb } from "@faridalms/database/business/client";
import type { OperatorSchool } from "@faridalms/database/directory/admin";

import { lastEvent, recordEvent } from "@faridalms/database/business/events";
import { payingTenants } from "@faridalms/database/business/invoices";
import { purgeLostLeads } from "@faridalms/database/business/leads";
import {
  grandfatherTenant,
  openSubscriptions,
} from "@faridalms/database/business/subscriptions";
import { LOST_LEAD_MONTHS } from "@faridalms/domain/leads";
import { settableOf } from "@faridalms/domain/plans";
import { trialOver } from "@faridalms/domain/subscriptions";
import { sql } from "drizzle-orm";
import * as v from "valibot";

import type { Publishing } from "./publication";

import { billingRound } from "./billing";
import { dunningRound } from "./dunning";
import { publishSubscription, SYSTEM_OPERATOR } from "./publication";

/** The tenants with schools served by a cell, each with its schools. */
export function tenantsOf(schools: readonly OperatorSchool[]) {
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
  /** Lost leads deleted two years after they were last contacted. */
  leadsDeleted: v.optional(v.number(), 0),
  /** Invoices the schedule drafted for finance to issue. */
  invoicesDrafted: v.optional(v.number(), 0),
  /** Terms that ended and renewed on their own. */
  renewed: v.optional(v.number(), 0),
  /** Emails the clock sent to billing contacts. */
  reminded: v.optional(v.number(), 0),
  /** Tenants whose access the clock changed. */
  accessChanged: v.optional(v.number(), 0),
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
 * contract becomes read only; the invoices due are drafted and ended terms
 * renewed; each unpaid invoice's clock moves on; a school whose customer
 * has paid an invoice has that step of its onboarding taken; a lead lost
 * two years ago is deleted. One
 * subscription's failure is recorded and the rest go on. Only one console
 * runs it at a time: null when another is.
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
      leadsDeleted: 0,
      invoicesDrafted: 0,
      renewed: 0,
      reminded: 0,
      accessChanged: 0,
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
          const paused = await deps.setStanding(
            subscription.tenantId,
            "read_only",
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
    try {
      const billed = await billingRound(deps, day, by);
      outcome.invoicesDrafted = billed.drafted;
      outcome.renewed = billed.renewed;
    } catch (error) {
      console.error(
        JSON.stringify({
          worker: "daily_round",
          billing: error instanceof Error ? error.message : String(error),
        }),
      );
      outcome.failed.push("billing");
    }
    try {
      const dunned = await dunningRound(deps, day, by);
      outcome.reminded = dunned.reminded;
      outcome.accessChanged = dunned.changed;
      outcome.failed.push(...dunned.failed);
    } catch (error) {
      console.error(
        JSON.stringify({
          worker: "daily_round",
          dunning: error instanceof Error ? error.message : String(error),
        }),
      );
      outcome.failed.push("dunning");
    }
    try {
      const paying = await payingTenants(deps.business);
      await deps.directory.reachOnboarding({
        schoolIds: [...tenants]
          .filter(([tenantId]) => paying.has(tenantId))
          .flatMap(([, schools]) => schools.map((school) => school.id)),
        item: "first_invoice_paid",
        at: deps.now(),
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          worker: "daily_round",
          onboarding: error instanceof Error ? error.message : String(error),
        }),
      );
      outcome.failed.push("onboarding");
    }
    const cutoff = new Date(`${day}T00:00:00Z`);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - LOST_LEAD_MONTHS);
    outcome.leadsDeleted = await purgeLostLeads(deps.business, cutoff);
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
