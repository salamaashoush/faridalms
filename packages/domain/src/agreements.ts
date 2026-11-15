import * as v from "valibot";

import { slugSchema } from "./provisioning";

/** The standing agreements a customer accepts before a school holds data. */
export const AGREEMENTS = ["terms", "dpa"] as const;
export type Agreement = (typeof AGREEMENTS)[number];

export const AGREEMENT_NAMES: Record<Agreement, { en: string; ar: string }> = {
  terms: { en: "Terms of service", ar: "شروط الخدمة" },
  dpa: { en: "Data processing agreement", ar: "اتفاقية معالجة البيانات" },
};

/** How a customer's acceptance came: through its own link, or on paper an operator kept. */
export const ACCEPTANCE_METHODS = ["link", "paper"] as const;
export type AcceptanceMethod = (typeof ACCEPTANCE_METHODS)[number];

/** Who the business log names for what a customer did through its own link. */
export const CUSTOMER_LINK_ACTOR = "customer-link";

/** How long a link to accept stands once sent. */
export const ACCEPTANCE_LINK_DAYS = 30;

const label = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const optionalText = (max: number) =>
  v.pipe(
    v.optional(v.nullable(v.string()), null),
    v.transform((value) => value?.trim() || null),
    v.nullable(v.pipe(v.string(), v.maxLength(max))),
  );
const email = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.maxLength(254),
  v.email("Enter an email address."),
);
const locale = v.picklist(["en", "ar"]);

/**
 * A version of an agreement as the owner publishes it: its label, the day
 * it takes effect and its words, in English and optionally Arabic. Once
 * published it never changes; a change is a new version.
 */
export const agreementVersionSchema = v.object({
  kind: v.picklist(AGREEMENTS),
  version: v.pipe(
    v.string(),
    v.trim(),
    v.regex(
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/,
      "Use letters, digits, dots, hyphens and underscores, such as 2026-11.",
    ),
  ),
  effectiveOn: v.pipe(v.string(), v.isoDate()),
  bodyEn: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200_000)),
  bodyAr: v.pipe(
    v.optional(v.nullable(v.string()), null),
    v.transform((value) => value?.trim() || null),
    v.nullable(v.pipe(v.string(), v.maxLength(200_000))),
  ),
  reason: label(500),
});
export type AgreementVersionInput = v.InferOutput<
  typeof agreementVersionSchema
>;

/** Who accepted on the customer's behalf, as they gave it. */
export const signerSchema = v.object({
  name: label(200),
  title: optionalText(120),
  email,
});
export type Signer = v.InferOutput<typeof signerSchema>;

/** A customer's person accepting the agreements put before them. */
export const agreementAcceptanceSchema = v.object({
  signer: signerSchema,
  accepted: v.literal(true, "Tick the box to accept."),
});

/**
 * What sending a quote as an offer asks: who it goes to, and for a lead,
 * the school its acceptance sets up, which sales names so its portal
 * address is chosen before the customer sees it.
 */
export const offerSchema = v.object({
  quoteId: v.pipe(v.string(), v.uuid()),
  to: v.object({ name: label(200), email, locale }),
  school: v.nullable(
    v.pipe(
      v.object({
        nameEn: optionalText(160),
        nameAr: optionalText(160),
        slug: slugSchema,
      }),
      v.check(
        (school) => school.nameEn !== null || school.nameAr !== null,
        "Give the school a name in English or Arabic.",
      ),
    ),
  ),
});
export type OfferInput = v.InferOutput<typeof offerSchema>;

/** The offer as kept with its quote once sent. */
export interface Offer {
  /** Names the link sent; sending again makes a new one and ends the old. */
  link: string;
  to: { name: string; email: string; locale: "en" | "ar" };
  school: { nameEn: string | null; nameAr: string | null; slug: string } | null;
}

/**
 * What the customer gives in accepting an offer: its legal details for
 * the invoices, who signs, the school's first administrator where the
 * offer sets up a school, and that it accepts the quote with the terms
 * and the data processing agreement.
 */
export const offerAcceptanceSchema = v.object({
  legalNameEn: label(200),
  legalNameAr: optionalText(200),
  taxNumber: optionalText(40),
  commercialRegistry: optionalText(40),
  address: optionalText(500),
  signer: signerSchema,
  administrator: v.nullable(
    v.object({
      givenName: label(75),
      familyName: label(75),
      email,
    }),
  ),
  accepted: v.literal(true, "Tick the box to accept."),
});
export type OfferAcceptance = v.InferOutput<typeof offerAcceptanceSchema>;

/** The digest an acceptance keeps, so the words accepted can be proved later. */
export async function agreementDigest(input: {
  bodyEn: string;
  bodyAr: string | null;
}): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${input.bodyEn}\n\u0000\n${input.bodyAr ?? ""}`,
  );
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
