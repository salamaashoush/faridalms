import * as v from "valibot";

import type { ContentDocument } from "./content";

import { audienceSchema, MANAGE_TABS } from "./announcements";
import {
  contentDocumentSchema,
  contentFileIds,
  contentPlainText,
} from "./content";

export const NEWSLETTER_LOCALES = ["en", "ar"] as const;
export type NewsletterLocale = (typeof NEWSLETTER_LOCALES)[number];

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");

/** Whether a language of an edition has anything in it to read. */
export function documentWritten(document: ContentDocument | null): boolean {
  return (
    document !== null &&
    (contentPlainText(document).trim() !== "" ||
      contentFileIds(document).length > 0)
  );
}

/**
 * Where the other language of a bilingual edition stands: not written yet,
 * written but not checked against the original, checked but the original has
 * changed since, or checked against the original as it now reads.
 */
export type TranslationState = "missing" | "unreviewed" | "stale" | "reviewed";

export function translationState(input: {
  translation: ContentDocument | null;
  reviewed: boolean;
  current: boolean;
}): TranslationState {
  if (!documentWritten(input.translation)) return "missing";
  if (!input.reviewed) return "unreviewed";
  return input.current ? "reviewed" : "stale";
}

export const listQuerySchema = v.object({
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
});

export const manageNewslettersSchema = v.object({
  tab: v.optional(v.picklist(MANAGE_TABS), "published"),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
});
export type ManageNewslettersQuery = v.InferOutput<
  typeof manageNewslettersSchema
>;

export const saveNewsletterSchema = v.pipe(
  v.object({
    id: optionalId,
    expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
    title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
    primaryLocale: v.picklist(NEWSLETTER_LOCALES),
    bilingual: v.boolean(),
    audiences: v.pipe(v.array(audienceSchema), v.minLength(1), v.maxLength(20)),
    body: contentDocumentSchema,
    translation: v.nullable(contentDocumentSchema),
  }),
  v.forward(
    v.check(
      (input) => input.bilingual || input.translation === null,
      "newsletters.translation_without_bilingual",
    ),
    ["translation"],
  ),
);
export type SaveNewsletter = v.InferOutput<typeof saveNewsletterSchema>;

export const publishNewsletterSchema = v.object({
  id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  /** Empty to go out now, or when it should go out. */
  publishAt: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.isoTimestamp())]),
    "",
  ),
});

/** Someone checked the translation against the original as it now reads, or took that back. */
export const reviewTranslationSchema = v.object({
  id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  reviewed: v.boolean(),
});

export const newsletterRefSchema = v.object({
  id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
