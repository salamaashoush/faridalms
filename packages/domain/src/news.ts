import * as v from "valibot";

import type { ContentDocument } from "./content";

import { audienceSchema } from "./announcements";
import {
  contentDocumentSchema,
  contentFileIds,
  contentPlainText,
} from "./content";
import { siteSlugSchema } from "./website";

export const NEWS_LOCALES = ["en", "ar"] as const;
export type NewsLocale = (typeof NEWS_LOCALES)[number];

/**
 * Where a post can be read: on the school's website as well as inside the
 * school, or only inside the school by its audience.
 */
export const NEWS_VISIBILITIES = ["public", "school"] as const;
export type NewsVisibility = (typeof NEWS_VISIBILITIES)[number];

export const NEWS_TABS = [
  "published",
  "scheduled",
  "drafts",
  "archived",
] as const;
export type NewsTab = (typeof NEWS_TABS)[number];

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const version = (min: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min));
const words = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));

export function otherNewsLocale(locale: NewsLocale): NewsLocale {
  return locale === "en" ? "ar" : "en";
}

/** Whether a language of a post has anything in it to read. */
export function documentWritten(document: ContentDocument | null): boolean {
  return (
    document !== null &&
    (contentPlainText(document).trim() !== "" ||
      contentFileIds(document).length > 0)
  );
}

/**
 * Where the other language of a post stands: not written yet, written but not
 * checked against the original, checked but the original has changed since,
 * or checked against the original as it now reads.
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

export const newsListSchema = v.object({
  q: v.optional(words(100), ""),
});

export const manageNewsSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(NEWS_TABS), "published"), "published"),
  q: v.fallback(v.optional(words(100), ""), ""),
});
export type ManageNewsQuery = v.InferOutput<typeof manageNewsSchema>;

export const saveNewsSchema = v.pipe(
  v.object({
    id: optionalId,
    expectedVersion: version(0),
    visibility: v.picklist(NEWS_VISIBILITIES),
    primaryLocale: v.picklist(NEWS_LOCALES),
    titleEn: words(200),
    titleAr: words(200),
    excerptEn: words(300),
    excerptAr: words(300),
    slug: siteSlugSchema,
    categoryId: optionalId,
    coverFileId: optionalId,
    coverAltEn: words(300),
    coverAltAr: words(300),
    pinned: v.boolean(),
    /** Who is told when it goes out; a school post needs someone. */
    audiences: v.pipe(v.array(audienceSchema), v.maxLength(20)),
    body: contentDocumentSchema,
    translation: v.nullable(contentDocumentSchema),
  }),
  v.forward(
    v.check(
      (input) =>
        (input.primaryLocale === "ar" ? input.titleAr : input.titleEn) !== "",
      "news.title",
    ),
    ["titleEn"],
  ),
  v.forward(
    v.check(
      (input) => input.visibility === "public" || input.audiences.length > 0,
      "news.audience",
    ),
    ["audiences"],
  ),
);
export type SaveNews = v.InferOutput<typeof saveNewsSchema>;

export const publishNewsSchema = v.object({
  id,
  expectedVersion: version(1),
  /** Empty to go out now, or when it should go out. */
  publishAt: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.isoTimestamp())]),
    "",
  ),
});

/** Someone checked the translation against the original as it now reads, or took that back. */
export const reviewNewsSchema = v.object({
  id,
  expectedVersion: version(1),
  reviewed: v.boolean(),
});

export const newsRefSchema = v.object({ id, expectedVersion: version(1) });
