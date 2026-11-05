import type { EntitlementsInput } from "@faridalms/domain/plans";
import type {
  Currency,
  EndPartsInput,
  OverrideInput,
  OverrideTerms,
  SubscriptionItemInput,
  SubscriptionItemTerms,
  SubscriptionTerms,
} from "@faridalms/domain/subscriptions";

import { BASIC_MODULES, MODULE_IDS } from "@faridalms/domain/modules";
import { LIMIT_KEYS, pickLimits } from "@faridalms/domain/subscriptions";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { BusinessDb, BusinessTx } from "./client";

import { recordEvent } from "./events";
import {
  addOns,
  addOnVersions,
  customers,
  entitlementPublications,
  plans,
  planVersions,
  subscriptionItems,
  subscriptionOverrides,
  subscriptions,
} from "./schema";

export type SubscriptionRow = typeof subscriptions.$inferSelect;

export class SubscriptionError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "already_open"
      | "version_retired"
      | "version_missing"
      | "ended",
  ) {
    super(code);
    this.name = "SubscriptionError";
  }
}

/** The tenant's subscription in force: a trial or an active contract. */
export async function openSubscription(
  db: BusinessDb | BusinessTx,
  tenantId: string,
): Promise<SubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.tenantId, tenantId),
        inArray(subscriptions.state, ["trial", "active"]),
      ),
    );
  return row ?? null;
}

export function openSubscriptions(db: BusinessDb): Promise<SubscriptionRow[]> {
  return db
    .select()
    .from(subscriptions)
    .where(inArray(subscriptions.state, ["trial", "active"]));
}

/** Every subscription in force, with its customer's name. */
export function listOpenSubscriptions(db: BusinessDb) {
  return db
    .select({
      subscription: subscriptions,
      customerName: customers.legalNameEn,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(inArray(subscriptions.state, ["trial", "active"]));
}

/** A subscription with its customer, items, overrides and publications, newest first. */
export async function subscriptionDetail(db: BusinessDb, id: string) {
  const [row] = await db
    .select({ subscription: subscriptions, customer: customers })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(eq(subscriptions.id, id));
  if (!row) return null;
  const [items, overrides, publications] = await Promise.all([
    db
      .select({
        item: subscriptionItems,
        plan: planVersions,
        planCode: plans.code,
        addOn: addOnVersions,
        addOnCode: addOns.code,
        addOnKind: addOns.kind,
      })
      .from(subscriptionItems)
      .leftJoin(
        planVersions,
        eq(planVersions.id, subscriptionItems.planVersionId),
      )
      .leftJoin(plans, eq(plans.id, planVersions.planId))
      .leftJoin(
        addOnVersions,
        eq(addOnVersions.id, subscriptionItems.addOnVersionId),
      )
      .leftJoin(addOns, eq(addOns.id, addOnVersions.addOnId))
      .where(eq(subscriptionItems.subscriptionId, id))
      .orderBy(subscriptionItems.startsOn, subscriptionItems.createdAt),
    db
      .select()
      .from(subscriptionOverrides)
      .where(eq(subscriptionOverrides.subscriptionId, id))
      .orderBy(subscriptionOverrides.startsOn, subscriptionOverrides.createdAt),
    db
      .select()
      .from(entitlementPublications)
      .where(eq(entitlementPublications.subscriptionId, id))
      .orderBy(desc(entitlementPublications.publishedAt))
      .limit(200),
  ]);
  return { ...row, items, overrides, publications };
}

export type SubscriptionDetail = NonNullable<
  Awaited<ReturnType<typeof subscriptionDetail>>
>;

/** The detail as the entitlement rule reads it. */
export function termsOf(detail: SubscriptionDetail): {
  items: SubscriptionItemTerms[];
  overrides: OverrideTerms[];
} {
  return {
    items: detail.items.map(({ item, plan, addOn, addOnKind }) => ({
      plan: plan ? { modules: plan.modules, limits: pickLimits(plan) } : null,
      addOn:
        addOn && addOnKind
          ? {
              kind: addOnKind,
              module: addOn.module,
              limitKey: addOn.limitKey,
              amount: addOn.amount,
            }
          : null,
      quantity: item.quantity,
      schoolIds: item.schoolIds,
      startsOn: item.startsOn,
      endsOn: item.endsOn,
    })),
    overrides: detail.overrides.map((override) => ({
      schoolId: override.schoolId,
      module: override.module,
      granted: override.granted,
      limitKey: override.limitKey,
      value: override.value,
      startsOn: override.startsOn,
      endsOn: override.endsOn,
    })),
  };
}

async function bump(tx: BusinessTx, id: string): Promise<number> {
  const [row] = await tx
    .update(subscriptions)
    .set({ revision: sql`${subscriptions.revision} + 1` })
    .where(eq(subscriptions.id, id))
    .returning({ revision: subscriptions.revision });
  return row?.revision ?? 0;
}

async function heldOpen(tx: BusinessTx, id: string): Promise<SubscriptionRow> {
  const [row] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, id))
    .for("update");
  if (!row) throw new SubscriptionError("not_found");
  if (row.state === "ended") throw new SubscriptionError("ended");
  return row;
}

/** Opens a tenant's subscription; a tenant holds one in force at a time. */
/**
 * Opens a tenant's subscription, with the items it was sold, in one
 * transaction; a tenant holds one in force at a time.
 */
export async function createSubscription(
  db: BusinessDb,
  input: {
    customerId: string;
    tenantId: string;
    currency: Currency;
    terms: SubscriptionTerms;
    items?: Omit<SubscriptionItemInput, "subscriptionId" | "reason">[];
    grandfathered?: boolean;
    by: string;
    reason: string;
  },
): Promise<string> {
  return db.transaction(async (tx) => {
    if (await openSubscription(tx, input.tenantId))
      throw new SubscriptionError("already_open");
    const [created] = await tx
      .insert(subscriptions)
      .values({
        customerId: input.customerId,
        tenantId: input.tenantId,
        currency: input.currency,
        ...input.terms,
        grandfathered: input.grandfathered ?? false,
      })
      .returning({ id: subscriptions.id });
    if (!created) throw new Error("subscription was not created");
    await recordEvent(tx, {
      operatorId: input.by,
      action: "subscription.create",
      subjectType: "subscription",
      subjectId: created.id,
      after: {
        tenantId: input.tenantId,
        currency: input.currency,
        ...input.terms,
      },
      reason: input.reason,
    });
    for (const item of input.items ?? [])
      await insertItem(
        tx,
        { ...item, subscriptionId: created.id, reason: input.reason },
        input.by,
      );
    return created.id;
  });
}

/**
 * Changes a subscription's terms. A grandfathered one given a contract's
 * term stops being grandfathered: from then on it is billed as sold.
 */
export async function setTerms(
  db: BusinessDb,
  input: { id: string; terms: SubscriptionTerms; by: string; reason: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await heldOpen(tx, input.id);
    await tx
      .update(subscriptions)
      .set({
        ...input.terms,
        grandfathered:
          before.grandfathered && input.terms.termStartsOn === null,
      })
      .where(eq(subscriptions.id, input.id));
    await bump(tx, input.id);
    await recordEvent(tx, {
      operatorId: input.by,
      action: "subscription.terms",
      subjectType: "subscription",
      subjectId: input.id,
      before: {
        state: before.state,
        termStartsOn: before.termStartsOn,
        termEndsOn: before.termEndsOn,
        trialEndsOn: before.trialEndsOn,
        renewal: before.renewal,
        schedule: before.schedule,
        contractedStudents: before.contractedStudents,
        censusOn: before.censusOn,
        notice: before.notice,
        grandfathered: before.grandfathered,
      },
      after: input.terms,
      reason: input.reason,
    });
  });
}

/** Writes an item of a version still sold, and moves the subscription's revision. */
async function insertItem(
  tx: BusinessTx,
  input: SubscriptionItemInput,
  by: string,
): Promise<string> {
  const { reason, ...item } = input;
  const table = item.planVersionId ? planVersions : addOnVersions;
  const versionId = item.planVersionId ?? item.addOnVersionId ?? "";
  const [version] = await tx
    .select({ retiredAt: table.retiredAt })
    .from(table)
    .where(eq(table.id, versionId));
  if (!version) throw new SubscriptionError("version_missing");
  if (version.retiredAt) throw new SubscriptionError("version_retired");
  const [created] = await tx
    .insert(subscriptionItems)
    .values({
      ...item,
      discountPercent: String(item.discountPercent),
      createdBy: by,
    })
    .returning({ id: subscriptionItems.id });
  if (!created) throw new Error("item was not created");
  await bump(tx, item.subscriptionId);
  await recordEvent(tx, {
    operatorId: by,
    action: "subscription.item_add",
    subjectType: "subscription",
    subjectId: item.subscriptionId,
    after: { itemId: created.id, ...item },
    reason,
  });
  return created.id;
}

/** Adds a plan or add-on version to a subscription from a day. */
export async function addItem(
  db: BusinessDb,
  input: SubscriptionItemInput & { by: string },
): Promise<string> {
  const { by, ...item } = input;
  return db.transaction(async (tx) => {
    await heldOpen(tx, item.subscriptionId);
    return insertItem(tx, item, by);
  });
}

/**
 * Ends items or overrides from a day: scheduled, or at once with today.
 * Answers how many it ended; one that has ended by then, or starts on or
 * after it, is left as it is.
 */
export async function endParts(
  db: BusinessDb,
  input: EndPartsInput & { by: string },
): Promise<number> {
  return db.transaction(async (tx) => {
    await heldOpen(tx, input.subscriptionId);
    const table =
      input.part === "item" ? subscriptionItems : subscriptionOverrides;
    const ended = await tx
      .update(table)
      .set({ endsOn: input.endsOn })
      .where(
        and(
          inArray(table.id, input.ids),
          eq(table.subscriptionId, input.subscriptionId),
          sql`${table.startsOn} < ${input.endsOn}::date`,
          sql`(${table.endsOn} is null or ${table.endsOn} > ${input.endsOn}::date)`,
        ),
      )
      .returning({ id: table.id });
    if (ended.length === 0) return 0;
    await bump(tx, input.subscriptionId);
    await recordEvent(tx, {
      operatorId: input.by,
      action:
        input.part === "item"
          ? "subscription.item_end"
          : "subscription.override_end",
      subjectType: "subscription",
      subjectId: input.subscriptionId,
      after: {
        [input.part === "item" ? "itemIds" : "overrideIds"]: ended.map(
          (row) => row.id,
        ),
        endsOn: input.endsOn,
      },
      reason: input.reason,
    });
    return ended.length;
  });
}

export async function addOverride(
  db: BusinessDb,
  input: OverrideInput & { by: string },
): Promise<string> {
  const { by, ...override } = input;
  return db.transaction(async (tx) => {
    await heldOpen(tx, override.subscriptionId);
    const [created] = await tx
      .insert(subscriptionOverrides)
      .values({ ...override, createdBy: by })
      .returning({ id: subscriptionOverrides.id });
    if (!created) throw new Error("override was not created");
    await bump(tx, override.subscriptionId);
    await recordEvent(tx, {
      operatorId: by,
      action: "subscription.override_add",
      subjectType: "subscription",
      subjectId: override.subscriptionId,
      after: { overrideId: created.id, ...override },
      reason: override.reason,
    });
    return created.id;
  });
}

export async function recordPublication(
  db: BusinessDb,
  input: {
    subscriptionId: string;
    schoolId: string;
    revision: number;
    entitlements: EntitlementsInput;
    by: string;
    reason: string;
  },
): Promise<void> {
  await db.insert(entitlementPublications).values({
    subscriptionId: input.subscriptionId,
    schoolId: input.schoolId,
    revision: input.revision,
    entitlements: input.entitlements,
    operatorId: input.by,
    reason: input.reason,
  });
}

/**
 * Gives a tenant that existed before the console sold anything a customer,
 * if it has none, and a grandfathered subscription whose overrides keep
 * each school's modules and limits exactly as they stand, until its first
 * renewal under a contract. A trial or notice set by hand on its schools is
 * the subscription's now: a trial to the latest of their ends, the first
 * notice any of them shows.
 */
export async function grandfatherTenant(
  db: BusinessDb,
  input: {
    tenantId: string;
    legalNameEn: string;
    legalNameAr: string | null;
    country: string;
    currency: Currency;
    schools: { schoolId: string; entitlements: EntitlementsInput }[];
    day: string;
    by: string;
  },
): Promise<string | null> {
  return db.transaction(async (tx) => {
    if (await openSubscription(tx, input.tenantId)) return null;
    const [held] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.tenantId, input.tenantId));
    let customerId = held?.id;
    if (!customerId) {
      const [created] = await tx
        .insert(customers)
        .values({
          legalNameEn: input.legalNameEn,
          legalNameAr: input.legalNameAr,
          country: input.country,
          currency: input.currency,
          tenantId: input.tenantId,
        })
        .returning({ id: customers.id });
      if (!created) throw new Error("customer was not created");
      customerId = created.id;
      await recordEvent(tx, {
        operatorId: input.by,
        action: "customer.create",
        subjectType: "customer",
        subjectId: customerId,
        after: {
          legalNameEn: input.legalNameEn,
          legalNameAr: input.legalNameAr,
          country: input.country,
          currency: input.currency,
          tenantId: input.tenantId,
        },
        reason: "Its tenant came before the console sold anything",
      });
    }
    const trialEndsOn =
      input.schools
        .map(({ entitlements }) => entitlements.trialEndsOn)
        .filter((day) => day !== null)
        .toSorted()
        .at(-1) ?? null;
    const notice =
      input.schools.find(({ entitlements }) => entitlements.notice)
        ?.entitlements.notice ?? null;
    const [subscription] = await tx
      .insert(subscriptions)
      .values({
        customerId,
        tenantId: input.tenantId,
        state: trialEndsOn ? "trial" : "active",
        trialEndsOn,
        notice,
        currency: input.currency,
        grandfathered: true,
        renewal: "manual",
      })
      .returning({ id: subscriptions.id });
    if (!subscription) throw new Error("subscription was not created");
    const reason = "Kept as the school had it before the console sold anything";
    const overrides = input.schools.flatMap(({ schoolId, entitlements }) => [
      ...MODULE_IDS.flatMap((module) => {
        const basic = (BASIC_MODULES as readonly string[]).includes(module);
        const entitled = entitlements.modules.includes(module);
        return basic === entitled
          ? []
          : [
              {
                schoolId,
                module,
                granted: entitled,
                limitKey: null,
                value: null,
              },
            ];
      }),
      ...LIMIT_KEYS.map((limitKey) => ({
        schoolId,
        module: null,
        granted: null,
        limitKey,
        value: entitlements[limitKey],
      })),
    ]);
    if (overrides.length)
      await tx.insert(subscriptionOverrides).values(
        overrides.map((override) => ({
          ...override,
          subscriptionId: subscription.id,
          startsOn: input.day,
          endsOn: null,
          reason,
          createdBy: input.by,
        })),
      );
    await recordEvent(tx, {
      operatorId: input.by,
      action: "subscription.grandfather",
      subjectType: "subscription",
      subjectId: subscription.id,
      after: { tenantId: input.tenantId, schools: input.schools.length },
      reason,
    });
    return subscription.id;
  });
}
