import type {
  AddOnVersionInput,
  Price,
  PlanVersionInput,
} from "@faridalms/domain/subscriptions";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import type { BusinessDb, BusinessTx } from "./client";

import { recordEvent } from "./events";
import { addOns, addOnVersions, plans, planVersions, prices } from "./schema";

export type PlanVersionRow = typeof planVersions.$inferSelect & {
  code: string;
  prices: Price[];
};
export type AddOnVersionRow = typeof addOnVersions.$inferSelect & {
  code: string;
  kind: (typeof addOns.$inferSelect)["kind"];
  prices: Price[];
};

async function pricesOf(
  db: BusinessDb | BusinessTx,
): Promise<{ plan: Map<string, Price[]>; addOn: Map<string, Price[]> }> {
  const rows = await db.select().from(prices);
  const plan = new Map<string, Price[]>();
  const addOn = new Map<string, Price[]>();
  for (const row of rows) {
    const price: Price = {
      currency: row.currency,
      unit: row.unit,
      amountMinor: row.amountMinor,
      minimumMinor: row.minimumMinor,
    };
    const owner = row.planVersionId ?? row.addOnVersionId;
    if (!owner) continue;
    const into = row.planVersionId ? plan : addOn;
    into.set(owner, [...(into.get(owner) ?? []), price]);
  }
  return { plan, addOn };
}

/** Every plan and add-on version, newest first within each, with prices. */
export async function catalogue(db: BusinessDb): Promise<{
  plans: PlanVersionRow[];
  addOns: AddOnVersionRow[];
}> {
  const [planRows, addOnRows, priced] = await Promise.all([
    db
      .select({ version: planVersions, code: plans.code })
      .from(planVersions)
      .innerJoin(plans, eq(plans.id, planVersions.planId))
      .orderBy(asc(plans.code), desc(planVersions.version)),
    db
      .select({ version: addOnVersions, code: addOns.code, kind: addOns.kind })
      .from(addOnVersions)
      .innerJoin(addOns, eq(addOns.id, addOnVersions.addOnId))
      .orderBy(asc(addOns.code), desc(addOnVersions.version)),
    pricesOf(db),
  ]);
  return {
    plans: planRows.map((row) => ({
      ...row.version,
      code: row.code,
      prices: priced.plan.get(row.version.id) ?? [],
    })),
    addOns: addOnRows.map((row) => ({
      ...row.version,
      code: row.code,
      kind: row.kind,
      prices: priced.addOn.get(row.version.id) ?? [],
    })),
  };
}

export class CatalogueError extends Error {
  constructor(readonly code: "code_taken" | "not_found" | "kind_differs") {
    super(code);
    this.name = "CatalogueError";
  }
}

/**
 * Writes a new version of a plan, or a new plan as its first version.
 * Versions are never changed; a different price or set of modules is a
 * new version, and contracts keep the one they bought.
 */
export async function savePlanVersion(
  db: BusinessDb,
  input: PlanVersionInput & { by: string },
): Promise<string> {
  return db.transaction(async (tx) => {
    let planId = input.planId;
    if (!planId) {
      const [taken] = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.code, input.code));
      if (taken) throw new CatalogueError("code_taken");
      const [created] = await tx
        .insert(plans)
        .values({ code: input.code })
        .returning({ id: plans.id });
      if (!created) throw new Error("plan was not created");
      planId = created.id;
    } else {
      // Two new versions at once collide on the version's unique key.
      const [held] = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.id, planId));
      if (!held) throw new CatalogueError("not_found");
    }
    const [last] = await tx
      .select({
        version: sql<number>`coalesce(max(${planVersions.version}), 0)`,
      })
      .from(planVersions)
      .where(eq(planVersions.planId, planId));
    const [version] = await tx
      .insert(planVersions)
      .values({
        planId,
        version: (last?.version ?? 0) + 1,
        nameEn: input.nameEn,
        nameAr: input.nameAr,
        modules: [...new Set(input.modules)],
        ...input.limits,
        validFrom: input.validFrom,
        createdBy: input.by,
      })
      .returning({ id: planVersions.id, version: planVersions.version });
    if (!version) throw new Error("plan version was not created");
    if (input.prices.length)
      await tx.insert(prices).values(
        input.prices.map((price) => ({
          ...price,
          planVersionId: version.id,
        })),
      );
    await recordEvent(tx, {
      operatorId: input.by,
      action: "plan.version",
      subjectType: "plan",
      subjectId: planId,
      after: {
        version: version.version,
        modules: input.modules,
        limits: input.limits,
        prices: input.prices,
        validFrom: input.validFrom,
      },
      reason: input.reason,
    });
    return version.id;
  });
}

/** Writes a new version of an add-on, or a new add-on as its first version. */
export async function saveAddOnVersion(
  db: BusinessDb,
  input: AddOnVersionInput & { by: string },
): Promise<string> {
  return db.transaction(async (tx) => {
    let addOnId = input.addOnId;
    if (!addOnId) {
      const [taken] = await tx
        .select({ id: addOns.id })
        .from(addOns)
        .where(eq(addOns.code, input.code));
      if (taken) throw new CatalogueError("code_taken");
      const [created] = await tx
        .insert(addOns)
        .values({ code: input.code, kind: input.kind })
        .returning({ id: addOns.id });
      if (!created) throw new Error("add-on was not created");
      addOnId = created.id;
    } else {
      const [held] = await tx
        .select({ id: addOns.id, kind: addOns.kind })
        .from(addOns)
        .where(eq(addOns.id, addOnId));
      if (!held) throw new CatalogueError("not_found");
      if (held.kind !== input.kind) throw new CatalogueError("kind_differs");
    }
    const [last] = await tx
      .select({
        version: sql<number>`coalesce(max(${addOnVersions.version}), 0)`,
      })
      .from(addOnVersions)
      .where(eq(addOnVersions.addOnId, addOnId));
    const [version] = await tx
      .insert(addOnVersions)
      .values({
        addOnId,
        version: (last?.version ?? 0) + 1,
        nameEn: input.nameEn,
        nameAr: input.nameAr,
        module: input.module,
        limitKey: input.limitKey,
        amount: input.amount,
        validFrom: input.validFrom,
        createdBy: input.by,
      })
      .returning({ id: addOnVersions.id, version: addOnVersions.version });
    if (!version) throw new Error("add-on version was not created");
    if (input.prices.length)
      await tx.insert(prices).values(
        input.prices.map((price) => ({
          ...price,
          addOnVersionId: version.id,
        })),
      );
    await recordEvent(tx, {
      operatorId: input.by,
      action: "add_on.version",
      subjectType: "add_on",
      subjectId: addOnId,
      after: {
        version: version.version,
        kind: input.kind,
        module: input.module,
        limitKey: input.limitKey,
        amount: input.amount,
        prices: input.prices,
        validFrom: input.validFrom,
      },
      reason: input.reason,
    });
    return version.id;
  });
}

/** Stops a version being sold; contracts that hold it keep it. */
export async function retireVersion(
  db: BusinessDb,
  input: {
    kind: "plan" | "add_on";
    id: string;
    by: string;
    reason: string;
  },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const table = input.kind === "plan" ? planVersions : addOnVersions;
    const [retired] = await tx
      .update(table)
      .set({ retiredAt: new Date() })
      .where(and(eq(table.id, input.id), isNull(table.retiredAt)))
      .returning({ id: table.id });
    if (!retired) return false;
    await recordEvent(tx, {
      operatorId: input.by,
      action: input.kind === "plan" ? "plan.retire" : "add_on.retire",
      subjectType: input.kind === "plan" ? "plan_version" : "add_on_version",
      subjectId: input.id,
      reason: input.reason,
    });
    return true;
  });
}
