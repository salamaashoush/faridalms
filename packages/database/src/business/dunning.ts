import type { DunningPauseInput, DunningStep } from "@faridalms/domain/dunning";
import type { SchoolStanding } from "@faridalms/domain/provisioning";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { BusinessDb } from "./client";

import { recordEvent } from "./events";
import { outstanding } from "./invoices";
import {
  customers,
  dunningPauses,
  dunningStandings,
  dunningSteps,
  invoices,
} from "./schema";

export type DunningPauseRow = typeof dunningPauses.$inferSelect;
export type DunningStepRow = typeof dunningSteps.$inferSelect;

/**
 * Issued invoices still owed, oldest due first, with what is owed on each
 * and the customer's tenant and account owner; a customer's alone when named.
 */
export async function owedInvoices(
  db: BusinessDb,
  filter: { customerId?: string } = {},
) {
  const rows = await db
    .select({
      invoice: invoices,
      customerName: customers.legalNameEn,
      tenantId: customers.tenantId,
      accountOwnerId: customers.accountOwnerId,
    })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(
      and(
        inArray(invoices.state, ["issued", "partly_paid"]),
        filter.customerId
          ? eq(invoices.customerId, filter.customerId)
          : undefined,
      ),
    )
    .orderBy(asc(invoices.dueOn), asc(invoices.createdAt));
  const owed = await outstanding(
    db,
    rows.map((row) => row.invoice),
  );
  return rows.flatMap((row) => {
    const owedMinor = owed.get(row.invoice.id) ?? 0;
    return owedMinor > 0 && row.invoice.dueOn && row.invoice.number
      ? [
          {
            ...row,
            number: row.invoice.number,
            dueOn: row.invoice.dueOn,
            owedMinor,
          },
        ]
      : [];
  });
}
export type OwedInvoice = Awaited<ReturnType<typeof owedInvoices>>[number];

/** The pauses of the customers given, latest first. */
export function pausesOf(db: BusinessDb, customerIds: readonly string[]) {
  if (customerIds.length === 0) return Promise.resolve([]);
  return db
    .select()
    .from(dunningPauses)
    .where(inArray(dunningPauses.customerId, [...customerIds]))
    .orderBy(desc(dunningPauses.startsOn), desc(dunningPauses.createdAt));
}

/** Stops a customer's clock between two days, both included, and logs why. */
export async function addPause(
  db: BusinessDb,
  input: DunningPauseInput & { by: string },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(dunningPauses)
      .values({
        customerId: input.customerId,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        reason: input.reason,
        createdBy: input.by,
      })
      .returning({ id: dunningPauses.id });
    if (!created) throw new Error("the pause was not kept");
    await recordEvent(tx, {
      operatorId: input.by,
      action: "dunning.pause",
      subjectType: "customer",
      subjectId: input.customerId,
      after: { startsOn: input.startsOn, endsOn: input.endsOn },
      reason: input.reason,
    });
    return created.id;
  });
}

/**
 * Ends a pause today, or on the day it starts when that is later, so the
 * clock runs again from tomorrow. False when there is no such pause or it
 * has already ended.
 */
export async function endPause(
  db: BusinessDb,
  input: { id: string; today: string; by: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [held] = await tx
      .select()
      .from(dunningPauses)
      .where(eq(dunningPauses.id, input.id))
      .for("update");
    if (!held || held.endsOn <= input.today) return false;
    const endsOn = held.startsOn > input.today ? held.startsOn : input.today;
    await tx
      .update(dunningPauses)
      .set({ endsOn })
      .where(eq(dunningPauses.id, input.id));
    await recordEvent(tx, {
      operatorId: input.by,
      action: "dunning.pause_end",
      subjectType: "customer",
      subjectId: held.customerId,
      before: { endsOn: held.endsOn },
      after: { endsOn },
    });
    return true;
  });
}

/** The steps taken for the invoices given. */
export function stepsOf(db: BusinessDb, invoiceIds: readonly string[]) {
  if (invoiceIds.length === 0) return Promise.resolve([]);
  return db
    .select()
    .from(dunningSteps)
    .where(inArray(dunningSteps.invoiceId, [...invoiceIds]))
    .orderBy(asc(dunningSteps.createdAt));
}

/** Notes a step as taken for an invoice; false when it already was. */
export async function takeStep(
  db: BusinessDb,
  input: {
    invoiceId: string;
    step: DunningStep;
    takenOn: string;
    emailedTo: string[];
  },
): Promise<boolean> {
  const taken = await db
    .insert(dunningSteps)
    .values(input)
    .onConflictDoNothing()
    .returning({ invoiceId: dunningSteps.invoiceId });
  return taken.length > 0;
}

/** Every tenant the clock holds short of full access, and since when. */
export function heldStandings(db: BusinessDb) {
  return db.select().from(dunningStandings);
}

/** What the clock last set a tenant to; full when it changed nothing. */
export async function dunningStandingOf(
  db: BusinessDb,
  tenantId: string,
): Promise<SchoolStanding> {
  const [row] = await db
    .select({ standing: dunningStandings.standing })
    .from(dunningStandings)
    .where(eq(dunningStandings.tenantId, tenantId));
  return row?.standing ?? "full";
}

/** Notes what the clock set a tenant to, and logs it against the customer. */
export async function setDunningStanding(
  db: BusinessDb,
  input: {
    tenantId: string;
    customerId: string;
    standing: SchoolStanding;
    since: string;
    reason: string;
    by: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ standing: dunningStandings.standing })
      .from(dunningStandings)
      .where(eq(dunningStandings.tenantId, input.tenantId))
      .for("update");
    const was = before?.standing ?? "full";
    if (was === input.standing) return;
    if (input.standing === "full")
      await tx
        .delete(dunningStandings)
        .where(eq(dunningStandings.tenantId, input.tenantId));
    else
      await tx
        .insert(dunningStandings)
        .values({
          tenantId: input.tenantId,
          customerId: input.customerId,
          standing: input.standing,
          since: input.since,
        })
        .onConflictDoUpdate({
          target: dunningStandings.tenantId,
          set: { standing: input.standing, since: input.since },
        });
    await recordEvent(tx, {
      operatorId: input.by,
      action: "dunning.standing",
      subjectType: "customer",
      subjectId: input.customerId,
      before: { standing: was },
      after: { standing: input.standing },
      reason: input.reason,
    });
  });
}
