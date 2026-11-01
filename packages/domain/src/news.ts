import * as v from "valibot";

import { audienceSchema } from "./announcements";
import { contentDocumentSchema } from "./content";
import { CONTENT_LOCALES } from "./translations";
import { siteSlugSchema } from "./website";

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

export const NEWS_SORTS = ["date", "title"] as const;
export type NewsSort = (typeof NEWS_SORTS)[number];
/** How many posts a page of the readers' list holds. */
export const NEWS_PAGE = 25;

export const newsListSchema = v.object({
  q: v.optional(words(100), ""),
  sort: v.fallback(v.optional(v.picklist(NEWS_SORTS), "date"), "date"),
  direction: v.fallback(
    v.optional(v.picklist(["asc", "desc"]), "desc"),
    "desc",
  ),
  page: v.fallback(
    v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    1,
  ),
  /** Which language's titles a sort by title reads first. */
  locale: v.fallback(v.optional(v.picklist(CONTENT_LOCALES), "en"), "en"),
});
export type NewsListQuery = v.InferOutput<typeof newsListSchema>;

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
    primaryLocale: v.picklist(CONTENT_LOCALES),
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

export const newsRefSchema = v.object({ id, expectedVersion: version(1) });
