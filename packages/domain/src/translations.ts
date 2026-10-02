import * as v from "valibot";

import type { ContentDocument } from "./content";

import { contentFileIds, contentPlainText } from "./content";

/** The languages a school writes in; a document may have both. */
export const CONTENT_LOCALES = ["en", "ar"] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

export function otherLocale(locale: ContentLocale): ContentLocale {
  return locale === "en" ? "ar" : "en";
}

/** Whether a language of a document has anything in it to read. */
export function documentWritten(document: ContentDocument | null): boolean {
  return (
    document !== null &&
    (contentPlainText(document).trim() !== "" ||
      contentFileIds(document).length > 0)
  );
}

/**
 * Where the other language of a document stands: not written yet, written
 * but not checked against the original, checked but the original has
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

/** Someone checked the translation against the original as it now reads, or took that back. */
export const reviewTranslationSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  reviewed: v.boolean(),
});
