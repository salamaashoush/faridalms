import * as v from "valibot";

import type { BillingSchedule, PriceUnit } from "./subscriptions";

import { BILLING_SCHEDULES, CURRENCIES } from "./subscriptions";

export const QUOTE_STATES = [
  "draft",
  "sent",
  "accepted",
  "superseded",
] as const;
export type QuoteState = (typeof QUOTE_STATES)[number];

const money = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(10 ** 12),
);
const quantity = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(1_000_000),
);
const discount = v.pipe(v.number(), v.minValue(0), v.maxValue(100));
const isoDay = v.pipe(v.string(), v.isoDate());
const optionalText = (max: number) =>
  v.pipe(
    v.optional(v.nullable(v.string()), null),
    v.transform((value) => value?.trim() || null),
    v.nullable(v.pipe(v.string(), v.maxLength(max))),
  );

/**
 * A quote as an operator builds it from the catalogue: a plan version and
 * add-ons with their quantities and prices, the term and how it is billed,
 * and how long the offer stands.
 */
export const quoteSpecSchema = v.pipe(
  v.object({
    currency: v.picklist(CURRENCIES),
    planVersionId: v.nullable(v.pipe(v.string(), v.uuid())),
    quantity,
    unitPriceMinor: money,
    discountPercent: discount,
    addOns: v.pipe(
      v.array(
        v.object({
          addOnVersionId: v.pipe(v.string(), v.uuid()),
          quantity,
          unitPriceMinor: money,
          discountPercent: discount,
        }),
      ),
      v.maxLength(30),
    ),
    termStartsOn: isoDay,
    termEndsOn: isoDay,
    schedule: v.picklist(BILLING_SCHEDULES),
    validUntil: isoDay,
    notesEn: optionalText(2000),
    notesAr: optionalText(2000),
  }),
  v.check(
    (spec) => spec.termEndsOn > spec.termStartsOn,
    "The term ends after it starts.",
  ),
  v.check(
    (spec) => spec.planVersionId !== null || spec.addOns.length > 0,
    "A quote sells a plan or at least one add-on.",
  ),
);
export type QuoteSpec = v.InferOutput<typeof quoteSpecSchema>;

/** A line as the quote shows it, named as the version was when quoted. */
export interface QuoteLine {
  kind: "plan" | "add_on";
  versionId: string;
  nameEn: string;
  nameAr: string;
  unit: PriceUnit | null;
  quantity: number;
  unitPriceMinor: number;
  discountPercent: number;
}

export interface QuoteTotals {
  lines: (QuoteLine & { netMinor: number })[];
  subtotalMinor: number;
  vatPercent: number;
  vatMinor: number;
  totalMinor: number;
  /** What each instalment of the schedule comes to, the last taking any remainder. */
  instalmentsMinor: number[];
}

const INSTALMENTS: Record<BillingSchedule, number> = {
  annual: 1,
  two: 2,
  three: 3,
};

/**
 * A quote's amounts in minor units: each line after its discount, rounded
 * to the minor unit, the subtotal, VAT on it at the rate given, the total,
 * and the instalments the schedule splits it into.
 */
export function quoteTotals(input: {
  lines: readonly QuoteLine[];
  vatPercent: number;
  schedule: BillingSchedule;
}): QuoteTotals {
  const lines = input.lines.map((line) => ({
    ...line,
    netMinor: Math.round(
      line.quantity * line.unitPriceMinor * (1 - line.discountPercent / 100),
    ),
  }));
  const subtotalMinor = lines.reduce((sum, line) => sum + line.netMinor, 0);
  const vatMinor = Math.round((subtotalMinor * input.vatPercent) / 100);
  const totalMinor = subtotalMinor + vatMinor;
  const count = INSTALMENTS[input.schedule];
  const each = Math.floor(totalMinor / count);
  const instalmentsMinor = Array.from({ length: count }, (_, index) =>
    index === count - 1 ? totalMinor - each * (count - 1) : each,
  );
  return {
    lines,
    subtotalMinor,
    vatPercent: input.vatPercent,
    vatMinor,
    totalMinor,
    instalmentsMinor,
  };
}

/** A quote's number as customers see it: its year and sequence, then its version. */
export const quoteReference = (number: string, version: number) =>
  version > 1 ? `${number}-v${version}` : number;
