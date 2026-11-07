import type {
  BusinessProfileInput,
  TaxRateInput,
} from "@faridalms/domain/business";

import { asc, eq, sql } from "drizzle-orm";

import type { BusinessDb } from "./client";

import { recordEvent } from "./events";
import { businessProfile, taxRates } from "./schema";

export type BusinessProfileRow = typeof businessProfile.$inferSelect;
export type TaxRateRow = typeof taxRates.$inferSelect;

/** The business's legal details, or null until an owner sets them. */
export async function profile(
  db: BusinessDb,
): Promise<BusinessProfileRow | null> {
  const [row] = await db.select().from(businessProfile);
  return row ?? null;
}

/**
 * Sets the business's legal details, unless someone changed them since
 * they were read. Answers false on a stale save.
 */
export async function saveProfile(
  db: BusinessDb,
  input: BusinessProfileInput & { expectedVersion: number | null; by: string },
): Promise<boolean> {
  const { expectedVersion, by, reason, ...fields } = input;
  return db.transaction(async (tx) => {
    const [held] = await tx.select().from(businessProfile).for("update");
    if ((held?.version ?? null) !== expectedVersion) return false;
    if (held)
      await tx
        .update(businessProfile)
        .set({
          ...fields,
          version: sql`${businessProfile.version} + 1`,
          updatedAt: sql`statement_timestamp()`,
        })
        .where(eq(businessProfile.id, 1));
    else {
      // Two first saves both find no row to lock; the one that inserts
      // second has read a version that no longer holds.
      const inserted = await tx
        .insert(businessProfile)
        .values({ id: 1, ...fields })
        .onConflictDoNothing()
        .returning({ id: businessProfile.id });
      if (inserted.length === 0) return false;
    }
    await recordEvent(tx, {
      operatorId: by,
      action: "business.profile",
      subjectType: "business",
      subjectId: "profile",
      before: held
        ? Object.fromEntries(
            Object.keys(fields).map((key) => [
              key,
              held[key as keyof typeof fields] ?? null,
            ]),
          )
        : null,
      after: fields,
      reason,
    });
    return true;
  });
}

export function listTaxRates(db: BusinessDb): Promise<TaxRateRow[]> {
  return db
    .select()
    .from(taxRates)
    .orderBy(asc(taxRates.country), asc(taxRates.validFrom));
}

/** Adds a rate for a country from a day; false when one already starts that day. */
export async function addTaxRate(
  db: BusinessDb,
  input: TaxRateInput & { by: string },
): Promise<boolean> {
  const { by, reason, percent, ...fields } = input;
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(taxRates)
      .values({ ...fields, percent: String(percent), createdBy: by })
      .onConflictDoNothing()
      .returning({ id: taxRates.id });
    if (!created) return false;
    await recordEvent(tx, {
      operatorId: by,
      action: "tax_rate.create",
      subjectType: "tax_rate",
      subjectId: created.id,
      after: { ...fields, percent },
      reason,
    });
    return true;
  });
}
