import type {
  InvoiceKind,
  InvoiceLine,
  InvoiceState,
  PaymentInput,
} from "@faridalms/domain/invoices";
import type { Currency } from "@faridalms/domain/subscriptions";

import { dueDay, invoiceTotals } from "@faridalms/domain/invoices";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { BusinessDb, BusinessTx } from "./client";

import { recordEvent } from "./events";
import {
  creditNotes,
  customers,
  documentNumbers,
  invoiceLines,
  invoices,
  paymentAllocations,
  payments,
} from "./schema";

export type InvoiceRow = typeof invoices.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type CreditNoteRow = typeof creditNotes.$inferSelect;

export class InvoiceError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "not_draft"
      | "not_open"
      | "over_allocated"
      | "over_credited"
      | "currency_differs"
      | "customer_differs",
  ) {
    super(code);
    this.name = "InvoiceError";
  }
}

/** The next number of a series in a year, given in the caller's transaction. */
async function nextNumber(
  tx: BusinessTx,
  series: "INV" | "CN",
  year: number,
): Promise<string> {
  const [row] = await tx
    .insert(documentNumbers)
    .values({ series, year, last: 1 })
    .onConflictDoUpdate({
      target: [documentNumbers.series, documentNumbers.year],
      set: { last: sql`${documentNumbers.last} + 1` },
    })
    .returning({ last: documentNumbers.last });
  if (!row) throw new Error("no number was given");
  return `${series}-${year}-${String(row.last).padStart(5, "0")}`;
}

/** Invoices, newest first, with their customer's name; a customer's alone when named. */
export function listInvoices(
  db: BusinessDb,
  filter: { customerId?: string; states?: InvoiceState[] } = {},
) {
  return db
    .select({ invoice: invoices, customerName: customers.legalNameEn })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(
      and(
        filter.customerId
          ? eq(invoices.customerId, filter.customerId)
          : undefined,
        filter.states ? inArray(invoices.state, filter.states) : undefined,
      ),
    )
    .orderBy(desc(invoices.forDay), desc(invoices.createdAt));
}

/** What has been paid and credited against each invoice given. */
async function settled(db: BusinessDb | BusinessTx, ids: string[]) {
  if (ids.length === 0)
    return new Map<string, { paid: number; credited: number }>();
  const [paid, credited] = await Promise.all([
    db
      .select({
        invoiceId: paymentAllocations.invoiceId,
        amount: sql<string>`sum(${paymentAllocations.amountMinor})`,
      })
      .from(paymentAllocations)
      .where(inArray(paymentAllocations.invoiceId, ids))
      .groupBy(paymentAllocations.invoiceId),
    db
      .select({
        invoiceId: creditNotes.invoiceId,
        amount: sql<string>`sum(${creditNotes.totalMinor})`,
      })
      .from(creditNotes)
      .where(inArray(creditNotes.invoiceId, ids))
      .groupBy(creditNotes.invoiceId),
  ]);
  const out = new Map(ids.map((id) => [id, { paid: 0, credited: 0 }]));
  for (const row of paid) {
    const held = out.get(row.invoiceId);
    if (held) held.paid = Number(row.amount);
  }
  for (const row of credited) {
    const held = out.get(row.invoiceId);
    if (held) held.credited = Number(row.amount);
  }
  return out;
}

/** What is still owed on invoices, for listing them. */
export async function outstanding(
  db: BusinessDb,
  rows: readonly InvoiceRow[],
): Promise<Map<string, number>> {
  const sums = await settled(
    db,
    rows.map((row) => row.id),
  );
  return new Map(
    rows.map((row) => {
      const held = sums.get(row.id) ?? { paid: 0, credited: 0 };
      return [row.id, Math.max(0, row.totalMinor - held.paid - held.credited)];
    }),
  );
}

/** An invoice with its lines, what paid it, its credit notes and what is owed. */
export async function invoiceById(db: BusinessDb, id: string) {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!invoice) return null;
  const [lines, allocations, credits, sums] = await Promise.all([
    db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, id))
      .orderBy(asc(invoiceLines.position)),
    db
      .select({ allocation: paymentAllocations, payment: payments })
      .from(paymentAllocations)
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(eq(paymentAllocations.invoiceId, id))
      .orderBy(asc(payments.receivedOn)),
    db
      .select()
      .from(creditNotes)
      .where(eq(creditNotes.invoiceId, id))
      .orderBy(asc(creditNotes.issuedOn)),
    settled(db, [id]),
  ]);
  const held = sums.get(id) ?? { paid: 0, credited: 0 };
  return {
    invoice,
    lines: lines.map((line): InvoiceLine => ({
      descriptionEn: line.descriptionEn,
      descriptionAr: line.descriptionAr,
      itemCode: line.itemCode,
      periodStart: line.periodStart,
      periodEnd: line.periodEnd,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      discountPercent: Number(line.discountPercent),
    })),
    allocations,
    credits,
    paidMinor: held.paid,
    creditedMinor: held.credited,
    owedMinor: Math.max(0, invoice.totalMinor - held.paid - held.credited),
  };
}

export type InvoiceDetail = NonNullable<
  Awaited<ReturnType<typeof invoiceById>>
>;

async function writeLines(
  tx: BusinessTx,
  invoiceId: string,
  lines: readonly InvoiceLine[],
) {
  await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  if (lines.length)
    await tx.insert(invoiceLines).values(
      lines.map((line, position) => ({
        ...line,
        invoiceId,
        position,
        discountPercent: String(line.discountPercent),
      })),
    );
}

export interface DraftInvoiceInput {
  customerId: string;
  subscriptionId: string | null;
  kind: InvoiceKind;
  /** Set for a scheduled invoice: the same key again drafts nothing. */
  scheduleKey: string | null;
  forDay: string;
  currency: Currency;
  country: string;
  language: "en" | "ar";
  vatPercent: number;
  reverseCharge: boolean;
  lines: InvoiceLine[];
  by: string;
}

/** Drafts an invoice for finance to check and issue; null when its schedule key was drafted before. */
export async function draftInvoice(
  db: BusinessDb,
  input: DraftInvoiceInput,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const totals = invoiceTotals(input.lines, input.vatPercent);
    const [created] = await tx
      .insert(invoices)
      .values({
        customerId: input.customerId,
        subscriptionId: input.subscriptionId,
        kind: input.kind,
        scheduleKey: input.scheduleKey,
        forDay: input.forDay,
        currency: input.currency,
        country: input.country,
        language: input.language,
        vatPercent: String(input.vatPercent),
        reverseCharge: input.reverseCharge,
        subtotalMinor: totals.subtotalMinor,
        vatMinor: totals.vatMinor,
        totalMinor: totals.totalMinor,
        createdBy: input.by,
      })
      .onConflictDoNothing({ target: invoices.scheduleKey })
      .returning({ id: invoices.id });
    if (!created) return null;
    await writeLines(tx, created.id, input.lines);
    await recordEvent(tx, {
      operatorId: input.by,
      action: "invoice.draft",
      subjectType: "invoice",
      subjectId: created.id,
      after: {
        kind: input.kind,
        forDay: input.forDay,
        totalMinor: totals.totalMinor,
      },
    });
    return created.id;
  });
}

/** Changes a draft's lines, order number and language before it is issued. */
export async function saveDraftInvoice(
  db: BusinessDb,
  input: {
    id: string;
    lines: InvoiceLine[];
    purchaseOrder: string | null;
    language: "en" | "ar";
    by: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [held] = await tx
      .select({ state: invoices.state, vatPercent: invoices.vatPercent })
      .from(invoices)
      .where(eq(invoices.id, input.id))
      .for("update");
    if (!held) throw new InvoiceError("not_found");
    if (held.state !== "draft") throw new InvoiceError("not_draft");
    const totals = invoiceTotals(input.lines, Number(held.vatPercent));
    await tx
      .update(invoices)
      .set({
        purchaseOrder: input.purchaseOrder,
        language: input.language,
        subtotalMinor: totals.subtotalMinor,
        vatMinor: totals.vatMinor,
        totalMinor: totals.totalMinor,
      })
      .where(eq(invoices.id, input.id));
    await writeLines(tx, input.id, input.lines);
    await recordEvent(tx, {
      operatorId: input.by,
      action: "invoice.update",
      subjectType: "invoice",
      subjectId: input.id,
      after: { totalMinor: totals.totalMinor },
    });
  });
}

/**
 * Issues a draft: its number, next in the year's series with no gap, the
 * day it is issued and the day it is due. Answers the number.
 */
export async function issueInvoice(
  db: BusinessDb,
  input: { id: string; issuedOn: string; netDays?: number; by: string },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [held] = await tx
      .select({ state: invoices.state, totalMinor: invoices.totalMinor })
      .from(invoices)
      .where(eq(invoices.id, input.id))
      .for("update");
    if (!held) throw new InvoiceError("not_found");
    if (held.state !== "draft") throw new InvoiceError("not_draft");
    const number = await nextNumber(
      tx,
      "INV",
      Number(input.issuedOn.slice(0, 4)),
    );
    await tx
      .update(invoices)
      .set({
        state: "issued",
        number,
        issuedOn: input.issuedOn,
        dueOn: dueDay(input.issuedOn, input.netDays),
      })
      .where(eq(invoices.id, input.id));
    await recordEvent(tx, {
      operatorId: input.by,
      action: "invoice.issue",
      subjectType: "invoice",
      subjectId: input.id,
      after: { number, issuedOn: input.issuedOn, totalMinor: held.totalMinor },
    });
    return number;
  });
}

/** Where an invoice stands from what paid and credited it. */
async function restate(tx: BusinessTx, id: string) {
  const [held] = await tx
    .select({ totalMinor: invoices.totalMinor, state: invoices.state })
    .from(invoices)
    .where(eq(invoices.id, id));
  if (!held || held.state === "draft") return;
  const sums = (await settled(tx, [id])).get(id) ?? { paid: 0, credited: 0 };
  const state: InvoiceState =
    sums.credited >= held.totalMinor
      ? "credited"
      : sums.paid + sums.credited >= held.totalMinor
        ? "paid"
        : sums.paid > 0
          ? "partly_paid"
          : "issued";
  if (state !== held.state)
    await tx.update(invoices).set({ state }).where(eq(invoices.id, id));
}

/**
 * Records a payment and what it settles, each settlement no more than the
 * invoice still owes, in one transaction. A card payment named by its
 * provider's transaction is recorded once: answered again, it is null.
 */
export async function recordPayment(
  db: BusinessDb,
  input: PaymentInput & { providerTransactionId?: string; by: string },
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(payments)
      .values({
        customerId: input.customerId,
        method: input.method,
        currency: input.currency,
        amountMinor: input.amountMinor,
        feeMinor: input.feeMinor,
        receivedOn: input.receivedOn,
        reference: input.reference,
        providerTransactionId: input.providerTransactionId ?? null,
        createdBy: input.by,
      })
      .onConflictDoNothing({ target: payments.providerTransactionId })
      .returning({ id: payments.id });
    if (!created) return null;
    await settle(
      tx,
      created.id,
      input.customerId,
      input.currency,
      input.allocations,
    );
    await recordEvent(tx, {
      operatorId: input.by,
      action: "payment.record",
      subjectType: "customer",
      subjectId: input.customerId,
      after: {
        paymentId: created.id,
        method: input.method,
        amountMinor: input.amountMinor,
        reference: input.reference,
        invoices: input.allocations.map((row) => row.invoiceId),
      },
    });
    return created.id;
  });
}

/**
 * Settles part of a payment against invoices, each no more than it still
 * owes, the whole no more than the payment has left.
 */
async function settle(
  tx: BusinessTx,
  paymentId: string,
  customerId: string,
  currency: Currency,
  allocations: readonly { invoiceId: string; amountMinor: number }[],
) {
  for (const allocation of allocations) {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, allocation.invoiceId))
      .for("update");
    if (!invoice) throw new InvoiceError("not_found");
    if (invoice.customerId !== customerId)
      throw new InvoiceError("customer_differs");
    if (invoice.currency !== currency)
      throw new InvoiceError("currency_differs");
    if (invoice.state !== "issued" && invoice.state !== "partly_paid")
      throw new InvoiceError("not_open");
    const sums = (await settled(tx, [invoice.id])).get(invoice.id) ?? {
      paid: 0,
      credited: 0,
    };
    if (allocation.amountMinor > invoice.totalMinor - sums.paid - sums.credited)
      throw new InvoiceError("over_allocated");
    await tx.insert(paymentAllocations).values({
      paymentId,
      invoiceId: invoice.id,
      amountMinor: allocation.amountMinor,
    });
    await restate(tx, invoice.id);
  }
}

/** What each of a customer's payments has not yet settled. */
export async function unsettledPayments(db: BusinessDb, customerId: string) {
  return db
    .select({
      payment: payments,
      leftMinor: sql<string>`${payments.amountMinor} - coalesce((select sum(${paymentAllocations.amountMinor}) from ${paymentAllocations} where ${paymentAllocations.paymentId} = ${payments.id}), 0)`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.customerId, customerId),
        sql`${payments.amountMinor} > coalesce((select sum(${paymentAllocations.amountMinor}) from ${paymentAllocations} where ${paymentAllocations.paymentId} = ${payments.id}), 0)`,
      ),
    )
    .orderBy(asc(payments.receivedOn));
}

/** Settles what is left of a payment already received against invoices. */
export async function allocatePayment(
  db: BusinessDb,
  input: {
    paymentId: string;
    allocations: { invoiceId: string; amountMinor: number }[];
    by: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, input.paymentId))
      .for("update");
    if (!payment) throw new InvoiceError("not_found");
    const [used] = await tx
      .select({
        amount: sql<string>`coalesce(sum(${paymentAllocations.amountMinor}), 0)`,
      })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, payment.id));
    const asked = input.allocations.reduce(
      (sum, row) => sum + row.amountMinor,
      0,
    );
    if (asked > payment.amountMinor - Number(used?.amount ?? 0))
      throw new InvoiceError("over_allocated");
    await settle(
      tx,
      payment.id,
      payment.customerId,
      payment.currency,
      input.allocations,
    );
    await recordEvent(tx, {
      operatorId: input.by,
      action: "payment.allocate",
      subjectType: "customer",
      subjectId: payment.customerId,
      after: {
        paymentId: payment.id,
        invoices: input.allocations.map((row) => row.invoiceId),
      },
    });
  });
}

/**
 * Credits an issued invoice, in part or whole, with why: a credit note
 * numbered in its own series. Its total is no more than the invoice still
 * stands for. Answers the note's number.
 */
export async function creditInvoice(
  db: BusinessDb,
  input: {
    invoiceId: string;
    lines: InvoiceLine[];
    reason: string;
    issuedOn: string;
    by: string;
  },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, input.invoiceId))
      .for("update");
    if (!invoice) throw new InvoiceError("not_found");
    if (invoice.state === "draft" || invoice.state === "credited")
      throw new InvoiceError("not_open");
    const totals = invoiceTotals(input.lines, Number(invoice.vatPercent));
    const sums = (await settled(tx, [invoice.id])).get(invoice.id) ?? {
      paid: 0,
      credited: 0,
    };
    if (totals.totalMinor > invoice.totalMinor - sums.credited)
      throw new InvoiceError("over_credited");
    const number = await nextNumber(
      tx,
      "CN",
      Number(input.issuedOn.slice(0, 4)),
    );
    await tx.insert(creditNotes).values({
      invoiceId: invoice.id,
      number,
      issuedOn: input.issuedOn,
      reason: input.reason,
      lines: input.lines,
      subtotalMinor: totals.subtotalMinor,
      vatMinor: totals.vatMinor,
      totalMinor: totals.totalMinor,
      createdBy: input.by,
    });
    await restate(tx, invoice.id);
    await recordEvent(tx, {
      operatorId: input.by,
      action: "invoice.credit",
      subjectType: "invoice",
      subjectId: invoice.id,
      after: { number, totalMinor: totals.totalMinor },
      reason: input.reason,
    });
    return number;
  });
}

/** The tax authority's id for an issued invoice or credit note, once finance has it. */
export async function setTaxAuthorityId(
  db: BusinessDb,
  input: {
    document: "invoice" | "credit_note";
    id: string;
    taxAuthorityId: string;
    by: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    if (input.document === "invoice")
      await tx
        .update(invoices)
        .set({ taxAuthorityId: input.taxAuthorityId })
        .where(eq(invoices.id, input.id));
    else
      await tx
        .update(creditNotes)
        .set({ taxAuthorityId: input.taxAuthorityId })
        .where(eq(creditNotes.id, input.id));
    await recordEvent(tx, {
      operatorId: input.by,
      action: "invoice.tax_id",
      subjectType: input.document === "invoice" ? "invoice" : "credit_note",
      subjectId: input.id,
      after: { taxAuthorityId: input.taxAuthorityId },
    });
  });
}

/** Keeps the card payment link made for an invoice, and the provider's order it pays. */
export async function setPaymentLink(
  db: BusinessDb,
  input: {
    id: string;
    linkId: string;
    orderId: string;
    url: string;
    by: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        paymentLinkId: input.linkId,
        paymentOrderId: input.orderId,
        paymentLinkUrl: input.url,
      })
      .where(eq(invoices.id, input.id));
    await recordEvent(tx, {
      operatorId: input.by,
      action: "invoice.payment_link",
      subjectType: "invoice",
      subjectId: input.id,
      after: { linkId: input.linkId },
    });
  });
}

/** The invoice a card payment's provider order was made for. */
export async function invoiceOfPaymentOrder(
  db: BusinessDb,
  orderId: string,
): Promise<InvoiceRow | null> {
  const [row] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.paymentOrderId, orderId));
  return row ?? null;
}

/** A customer's payments, newest first. */
export function paymentsOf(db: BusinessDb, customerId: string) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.customerId, customerId))
    .orderBy(desc(payments.receivedOn), desc(payments.createdAt));
}
