import * as v from "valibot";

const text = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const optionalText = (max: number) =>
  v.pipe(
    v.optional(v.nullable(v.string()), null),
    v.transform((value) => value?.trim() || null),
    v.nullable(v.pipe(v.string(), v.maxLength(max))),
  );

/**
 * The business's own legal details, as every quote and invoice carries
 * them, in both languages where a reader sees them.
 */
export const businessProfileSchema = v.object({
  legalNameEn: text(200),
  legalNameAr: text(200),
  addressEn: text(500),
  addressAr: text(500),
  taxNumber: text(40),
  commercialRegistry: optionalText(40),
  email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email()),
  phone: optionalText(40),
  website: optionalText(200),
  bankDetailsEn: optionalText(1000),
  bankDetailsAr: optionalText(1000),
  reason: text(500),
});
export type BusinessProfileInput = v.InferOutput<typeof businessProfileSchema>;

/**
 * The VAT a customer in a country is charged from a day. A country with
 * no rate in force is charged none, which a quote then says.
 */
export const taxRateSchema = v.object({
  country: v.pipe(v.string(), v.trim(), v.toUpperCase(), v.regex(/^[A-Z]{2}$/)),
  percent: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
  nameEn: text(60),
  nameAr: text(60),
  /** The customer accounts for the VAT: a registered business abroad. */
  reverseCharge: v.optional(v.boolean(), false),
  validFrom: v.pipe(v.string(), v.isoDate()),
  reason: text(500),
});
export type TaxRateInput = v.InferOutput<typeof taxRateSchema>;

/** The rate in force for a country on a day, the latest that began by then. */
export function rateOn<T extends { country: string; validFrom: string }>(
  rates: readonly T[],
  country: string,
  day: string,
): T | null {
  return (
    rates
      .filter((rate) => rate.country === country && rate.validFrom <= day)
      .toSorted((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null
  );
}
