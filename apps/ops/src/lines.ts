import type { InvoiceLine } from "@faridalms/domain/invoices";

import { netMinor } from "@faridalms/domain/money";

import { minorOf } from "./format";

/** A line of an invoice or credit note as an operator types it, money in the currency's units. */
export interface LineDraft {
  descriptionEn: string;
  descriptionAr: string;
  itemCode: string;
  periodStart: string;
  periodEnd: string;
  quantity: string;
  price: string;
  discount: string;
}

export type LineField = keyof LineDraft;

/** What is wrong with each field of a line, by field. */
export type LineErrors = Partial<Record<LineField, string>>;

/** What reading a line gave: the line, or what is wrong with which field. */
export type ReadLine =
  | { ok: true; line: InvoiceLine }
  | { ok: false; errors: LineErrors };

const MOST_MINOR = 10 ** 12;
const MOST_QUANTITY = 1_000_000;

export const lineDraftOf = (line: InvoiceLine): LineDraft => ({
  descriptionEn: line.descriptionEn,
  descriptionAr: line.descriptionAr,
  itemCode: line.itemCode ?? "",
  periodStart: line.periodStart ?? "",
  periodEnd: line.periodEnd ?? "",
  quantity: String(line.quantity),
  price: (line.unitPriceMinor / 100).toFixed(2),
  discount: String(line.discountPercent),
});

export const blankLine = (): LineDraft => ({
  descriptionEn: "",
  descriptionAr: "",
  itemCode: "",
  periodStart: "",
  periodEnd: "",
  quantity: "1",
  price: "",
  discount: "0",
});

function quantityOf(typed: string): number | null {
  const quantity = Number(typed.trim());
  return typed.trim() !== "" &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= MOST_QUANTITY
    ? quantity
    : null;
}

function discountOf(typed: string): number | null {
  const discount = Number(typed.trim() || "0");
  return Number.isFinite(discount) && discount >= 0 && discount <= 100
    ? discount
    : null;
}

function priceOf(typed: string): number | null {
  const minor = minorOf(typed);
  return minor !== null && minor <= MOST_MINOR ? minor : null;
}

/**
 * A line as the server takes it, or what stops it, by the rules of
 * `invoiceLineSchema`: both descriptions, a whole quantity from 1, a
 * price, a discount from 0 to 100, and a period that does not end
 * before it starts.
 */
export function readLine(draft: LineDraft): ReadLine {
  const errors: LineErrors = {};
  const descriptionEn = draft.descriptionEn.trim();
  const descriptionAr = draft.descriptionAr.trim();
  if (!descriptionEn) errors.descriptionEn = "Describe it in English.";
  if (!descriptionAr) errors.descriptionAr = "Describe it in Arabic.";
  const quantity = quantityOf(draft.quantity);
  if (quantity === null)
    errors.quantity = "Give a whole number from 1 to 1,000,000.";
  const unitPriceMinor = priceOf(draft.price);
  if (unitPriceMinor === null) errors.price = "Give its unit price.";
  const discountPercent = discountOf(draft.discount);
  if (discountPercent === null)
    errors.discount = "Give a discount between 0 and 100.";
  if (
    draft.periodStart &&
    draft.periodEnd &&
    draft.periodEnd < draft.periodStart
  )
    errors.periodEnd = "End it on or after the day it starts.";
  if (
    quantity === null ||
    unitPriceMinor === null ||
    discountPercent === null ||
    Object.keys(errors).length > 0
  )
    return { ok: false, errors };
  return {
    ok: true,
    line: {
      descriptionEn,
      descriptionAr,
      itemCode: draft.itemCode.trim() || null,
      periodStart: draft.periodStart || null,
      periodEnd: draft.periodEnd || null,
      quantity,
      unitPriceMinor,
      discountPercent,
    },
  };
}

/** What a line comes to after its discount, once its figures can be read. */
export function draftNet(draft: LineDraft): number | null {
  const quantity = quantityOf(draft.quantity);
  const unitPriceMinor = priceOf(draft.price);
  const discountPercent = discountOf(draft.discount);
  if (quantity === null || unitPriceMinor === null || discountPercent === null)
    return null;
  return netMinor({ quantity, unitPriceMinor, discountPercent });
}

/** Only the fields a line is saved with. */
export const plainLine = (line: InvoiceLine): InvoiceLine => ({
  descriptionEn: line.descriptionEn,
  descriptionAr: line.descriptionAr,
  itemCode: line.itemCode,
  periodStart: line.periodStart,
  periodEnd: line.periodEnd,
  quantity: line.quantity,
  unitPriceMinor: line.unitPriceMinor,
  discountPercent: line.discountPercent,
});
