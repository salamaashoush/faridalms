import * as v from "valibot";

import { contentDocumentSchema } from "./content";
import { addYears } from "./privacy";
import { CONTENT_LOCALES } from "./translations";

export const CONSENT_DECISIONS = ["granted", "refused", "withdrawn"] as const;
export type ConsentDecision = (typeof CONSENT_DECISIONS)[number];

/** How the office heard a family's answer: a signed form it keeps a scan of, or in person. */
export const OFFICE_METHODS = ["paper_scanned", "verbal_recorded"] as const;
export type OfficeMethod = (typeof OFFICE_METHODS)[number];

export type ConsentMethod =
  | "electronic"
  | "electronic_signature"
  | "paper_scanned"
  | "verbal_recorded"
  | "import";

/** Purposes whose answer decides whether a student's picture may be shown, and where. */
export const PHOTO_MEANINGS = [
  "photo_website",
  "photo_social",
  "photo_internal",
] as const;
export type PhotoMeaning = (typeof PHOTO_MEANINGS)[number];

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const version = (min: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min));

export const consentFormSchema = v.object({ purposeId: id });

export const saveConsentFormSchema = v.object({
  id: optionalId,
  expectedVersion: version(0),
  purposeId: id,
  primaryLocale: v.picklist(CONTENT_LOCALES),
  body: contentDocumentSchema,
  translation: v.nullable(contentDocumentSchema),
});
export type SaveConsentForm = v.InferOutput<typeof saveConsentFormSchema>;

export const consentFormRefSchema = v.object({
  id,
  expectedVersion: version(1),
});

export const reviewConsentFormSchema = v.object({
  id,
  expectedVersion: version(1),
  reviewed: v.boolean(),
});

export const recordConsentSchema = v.pipe(
  v.object({
    studentId: id,
    purposeId: id,
    relationshipId: id,
    agreed: v.boolean(),
    method: v.picklist(OFFICE_METHODS),
    givenOn: v.pipe(v.string(), v.isoDate()),
    fileId: optionalId,
    note: v.pipe(v.string(), v.trim(), v.maxLength(500)),
  }),
  v.forward(
    v.check(
      (input) => input.method !== "paper_scanned" || input.fileId !== "",
      "consents.scan",
    ),
    ["fileId"],
  ),
);
export type RecordConsent = v.InferOutput<typeof recordConsentSchema>;

export const answerConsentSchema = v.object({
  studentId: id,
  noticeId: id,
  agreed: v.boolean(),
});

/**
 * A no after a yes takes the yes back; a no to begin with is a refusal. The
 * two read the same but the register keeps which it was.
 */
export function decisionFor(
  agreed: boolean,
  current: ConsentDecision | null,
): ConsentDecision {
  if (agreed) return "granted";
  return current === "granted" ? "withdrawn" : "refused";
}

/**
 * When an answer given for a child must be asked again. Egypt's regulations
 * let a guardian answer alone for a child under 15; from 15 the child takes
 * part, so a younger child's answer is due again on their fifteenth
 * birthday. Elsewhere an answer stands until it is changed.
 */
export function refreshDueOn(input: {
  birthDate: string | null;
  givenOn: string;
  /** The school's country, whose law applies. */
  country: string | null;
}): string | null {
  if (input.country !== "EG" || !input.birthDate) return null;
  const fifteen = addYears(input.birthDate, 15);
  return fifteen > input.givenOn ? fifteen : null;
}
