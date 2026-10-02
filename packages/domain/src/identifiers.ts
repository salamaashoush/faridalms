import * as v from "valibot";

/**
 * Identity documents, whose numbers are sealed: the database keeps only
 * ciphertext and a keyed hash for exact lookup.
 */
export const SEALED_MEANINGS = [
  "national_id",
  "passport",
  "residence_permit",
  "birth_certificate",
] as const;

/**
 * Numbers other systems give the student that the office keeps on the record.
 * The school reference has its own field, and roster and legacy ids belong
 * to the integrations that write them.
 */
export const SYSTEM_KEPT_MEANINGS = [
  "school_reference",
  "roster_sourced_id",
  "legacy_id",
] as const;

/** How far ahead the office is warned of a passport or permit running out. */
export const EXPIRY_WARNING_DAYS = 60;

export const isSealed = (meaning: string | null) =>
  (SEALED_MEANINGS as readonly string[]).includes(meaning ?? "");

/** One form of a number for lookup, whatever spacing or dashes it was typed with. */
export const normaliseIdentifier = (value: string) =>
  value.toUpperCase().replaceAll(/[\s\-./]/g, "");

/**
 * What an Egyptian national ID number says about its holder: the first digit
 * is the century (2 for 1900s, 3 for 2000s), then the birth date as YYMMDD,
 * the governorate, and a serial whose last digit is odd for males.
 */
export function egyptianIdFacts(
  value: string,
): { birthDate: string; sex: "male" | "female" } | null {
  const digits = normaliseIdentifier(value);
  if (!/^[23]\d{13}$/.test(digits)) return null;
  const century = digits[0] === "2" ? 1900 : 2000;
  const year = century + Number(digits.slice(1, 3));
  const month = digits.slice(3, 5);
  const day = digits.slice(5, 7);
  const birthDate = `${year}-${month}-${day}`;
  const parsed = new Date(`${birthDate}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== birthDate
  )
    return null;
  return {
    birthDate,
    sex: Number(digits[12]) % 2 === 1 ? "male" : "female",
  };
}

const id = v.pipe(v.string(), v.uuid());
const optionalDate = v.optional(
  v.union([v.literal(""), v.pipe(v.string(), v.isoDate())]),
  "",
);

export const saveIdentifierSchema = v.pipe(
  v.object({
    studentId: id,
    id: v.optional(v.union([v.literal(""), id]), ""),
    expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
    systemId: id,
    /** Empty when correcting a document's other details keeps its number. */
    number: v.pipe(v.string(), v.trim(), v.maxLength(64)),
    issuingCountry: v.optional(
      v.union([v.literal(""), v.pipe(v.string(), v.regex(/^[A-Z]{2}$/))]),
      "",
    ),
    validFrom: optionalDate,
    expiresOn: optionalDate,
  }),
  v.forward(
    v.check(
      (input) => input.id !== "" || input.number !== "",
      "identifiers.number",
    ),
    ["number"],
  ),
  v.forward(
    v.check(
      (input) =>
        !input.validFrom ||
        !input.expiresOn ||
        input.expiresOn > input.validFrom,
      "identifiers.dates",
    ),
    ["expiresOn"],
  ),
);
export type SaveIdentifier = v.InferOutput<typeof saveIdentifierSchema>;

export const identifierRefSchema = v.object({
  id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
