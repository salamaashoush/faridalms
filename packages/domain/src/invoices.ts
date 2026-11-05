import * as v from "valibot";

import type { BillingSchedule } from "./subscriptions";

import { netMinor, vatMinor } from "./money";
import { addDays } from "./school";
import { CURRENCIES } from "./subscriptions";

export const INVOICE_STATES = [
  "draft",
  "issued",
  "partly_paid",
  "paid",
  "credited",
] as const;
export type InvoiceState = (typeof INVOICE_STATES)[number];

/** What an invoice is for, which also keeps a scheduled one from being drafted twice. */
export const INVOICE_KINDS = [
  "instalment",
  "proration",
  "true_up",
  "manual",
] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

/**
 * How money arrives. A withholding certificate is the 3% an Egyptian school
 * deducts from a service payment as an advance on the supplier's income
 * tax: recorded as a payment, so a 97% transfer leaves nothing open.
 */
export const PAYMENT_METHODS = [
  "bank_transfer",
  "card",
  "instapay",
  "cheque",
  "withholding_certificate",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Days from issue to due, unless the invoice says otherwise. */
export const NET_DAYS = 30;
/** How far ahead of its day a scheduled invoice is drafted, for finance to issue it in time. */
export const DRAFT_AHEAD_DAYS = 14;
/** Students past the contracted count, above this share, are invoiced at the census. */
export const TRUE_UP_TOLERANCE = 0.05;

/** A line of an invoice or credit note, in both languages. */
export interface InvoiceLine {
  descriptionEn: string;
  descriptionAr: string;
  /** The item's code registered with the tax authority, where it has one. */
  itemCode: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  quantity: number;
  unitPriceMinor: number;
  discountPercent: number;
}

/** Lines after their discount, the subtotal, VAT at the rate and the total, in minor units. */
export function invoiceTotals(
  lines: readonly InvoiceLine[],
  vatPercent: number,
) {
  const priced = lines.map((line) => ({ ...line, netMinor: netMinor(line) }));
  const subtotalMinor = priced.reduce((sum, line) => sum + line.netMinor, 0);
  const vat = vatMinor(subtotalMinor, vatPercent);
  return {
    lines: priced,
    subtotalMinor,
    vatMinor: vat,
    totalMinor: subtotalMinor + vat,
  };
}

/** A day some months on, held to the last day of a shorter month. */
export const addMonths = (day: string, months: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), last));
  return target.toISOString().slice(0, 10);
};

/** Whole months from one day to another, a started month counting whole. */
export function monthsBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    end.getUTCMonth() -
    start.getUTCMonth();
  return end.getUTCDate() > start.getUTCDate() ? months + 1 : months;
}

/**
 * The days a term's instalments fall due: its start; for two, five months
 * on (a September year's February); for three, four and seven months on
 * (January and April), one a school term.
 */
export function instalmentDays(
  termStartsOn: string,
  schedule: BillingSchedule,
): string[] {
  if (schedule === "two") return [termStartsOn, addMonths(termStartsOn, 5)];
  if (schedule === "three")
    return [
      termStartsOn,
      addMonths(termStartsOn, 4),
      addMonths(termStartsOn, 7),
    ];
  return [termStartsOn];
}

/**
 * The share of a year's price owed for what starts during a term: the whole
 * months left of it, a started month counting whole, over the term's.
 */
export function proratedShare(input: {
  startsOn: string;
  termStartsOn: string;
  termEndsOn: string;
}): number {
  const term = monthsBetween(input.termStartsOn, input.termEndsOn);
  const left = monthsBetween(input.startsOn, input.termEndsOn);
  return term > 0 ? Math.min(1, Math.max(0, left / term)) : 0;
}

/**
 * The students to invoice at the census: those past the contracted count,
 * when more than the tolerance above it; none otherwise, since a fall is
 * not credited during the term.
 */
export function trueUpStudents(contracted: number, counted: number): number {
  return counted > contracted * (1 + TRUE_UP_TOLERANCE)
    ? counted - contracted
    : 0;
}

export const dueDay = (issuedOn: string, netDays = NET_DAYS) =>
  addDays(issuedOn, netDays);

const isoDay = v.pipe(v.string(), v.isoDate());
const money = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(10 ** 12),
);
const text = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));

export const invoiceLineSchema = v.object({
  descriptionEn: text(300),
  descriptionAr: text(300),
  itemCode: v.pipe(
    v.optional(v.nullable(v.string()), null),
    v.transform((value) => value?.trim() || null),
    v.nullable(v.pipe(v.string(), v.maxLength(40))),
  ),
  periodStart: v.nullable(isoDay),
  periodEnd: v.nullable(isoDay),
  quantity: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(1_000_000),
  ),
  unitPriceMinor: money,
  discountPercent: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
});

/** A payment as finance records it, and what it settles. */
export const paymentSchema = v.pipe(
  v.object({
    customerId: v.pipe(v.string(), v.uuid()),
    method: v.picklist(PAYMENT_METHODS),
    currency: v.picklist(CURRENCIES),
    amountMinor: v.pipe(money, v.minValue(1)),
    receivedOn: isoDay,
    reference: text(120),
    feeMinor: v.optional(money, 0),
    allocations: v.pipe(
      v.array(
        v.object({
          invoiceId: v.pipe(v.string(), v.uuid()),
          amountMinor: v.pipe(money, v.minValue(1)),
        }),
      ),
      v.maxLength(50),
    ),
  }),
  v.check(
    (payment) =>
      payment.allocations.reduce((sum, row) => sum + row.amountMinor, 0) <=
      payment.amountMinor,
    "A payment settles no more than it is.",
  ),
);
export type PaymentInput = v.InferOutput<typeof paymentSchema>;

const lineView = v.object({
  descriptionEn: v.string(),
  descriptionAr: v.string(),
  itemCode: v.nullable(v.string()),
  periodStart: v.nullable(v.string()),
  periodEnd: v.nullable(v.string()),
  quantity: v.number(),
  unitPriceMinor: v.number(),
  discountPercent: v.number(),
});

/**
 * A school's billing as the operator console answers its cell: issued
 * invoices and their credit notes, what each owes and its card link, the
 * business's details and bank, and the billing contacts. Checked on
 * arrival, since it crosses from one service to another.
 */
export const schoolBillingSchema = v.object({
  customer: v.nullable(
    v.object({
      name: v.string(),
      nameAr: v.nullable(v.string()),
      address: v.nullable(v.string()),
      taxNumber: v.nullable(v.string()),
    }),
  ),
  business: v.optional(
    v.nullable(
      v.object({
        legalNameEn: v.string(),
        legalNameAr: v.string(),
        addressEn: v.string(),
        addressAr: v.string(),
        taxNumber: v.string(),
        commercialRegistry: v.nullable(v.string()),
        email: v.string(),
        bankDetailsEn: v.nullable(v.string()),
        bankDetailsAr: v.nullable(v.string()),
      }),
    ),
    null,
  ),
  vatName: v.optional(
    v.nullable(v.object({ en: v.string(), ar: v.string() })),
    null,
  ),
  invoices: v.optional(
    v.array(
      v.object({
        id: v.string(),
        number: v.string(),
        state: v.picklist(INVOICE_STATES),
        issuedOn: v.string(),
        dueOn: v.string(),
        currency: v.picklist(CURRENCIES),
        language: v.picklist(["en", "ar"]),
        purchaseOrder: v.nullable(v.string()),
        vatPercent: v.number(),
        reverseCharge: v.boolean(),
        subtotalMinor: v.number(),
        vatMinor: v.number(),
        totalMinor: v.number(),
        owedMinor: v.number(),
        paymentLinkUrl: v.nullable(v.pipe(v.string(), v.url())),
        lines: v.array(lineView),
        credits: v.array(
          v.object({
            id: v.string(),
            number: v.string(),
            issuedOn: v.string(),
            reason: v.string(),
            lines: v.array(lineView),
            subtotalMinor: v.number(),
            vatMinor: v.number(),
            totalMinor: v.number(),
          }),
        ),
      }),
    ),
    [],
  ),
  contacts: v.optional(
    v.array(
      v.object({
        name: v.string(),
        email: v.nullable(v.string()),
        phone: v.nullable(v.string()),
      }),
    ),
    [],
  ),
});
export type SchoolBilling = v.InferOutput<typeof schoolBillingSchema>;
