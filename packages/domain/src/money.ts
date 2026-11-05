/** A priced line: a quantity at a unit price in minor units, less a discount. */
export interface PricedLine {
  quantity: number;
  unitPriceMinor: number;
  discountPercent: number;
}

/** A line's amount after its discount, rounded to the minor unit. */
export const netMinor = (line: PricedLine) =>
  Math.round(
    line.quantity * line.unitPriceMinor * (1 - line.discountPercent / 100),
  );

/** VAT on an amount at a rate, rounded to the minor unit. */
export const vatMinor = (amount: number, percent: number) =>
  Math.round((amount * percent) / 100);

/** An amount split into equal parts, the last taking any remainder. */
export function splitMinor(total: number, parts: number): number[] {
  const each = Math.floor(total / parts);
  return Array.from({ length: parts }, (_, index) =>
    index === parts - 1 ? total - each * (parts - 1) : each,
  );
}
