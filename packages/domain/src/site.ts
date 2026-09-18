import * as v from "valibot";

import type { NewsletterDocument } from "./newsletter";

import { contentDocumentSchema, contentPlainText } from "./content";
import {
  newsletterAssetIds,
  newsletterDocumentSchema,
  newsletterPlainText,
} from "./newsletter";
import { isSafeContentUrl } from "./rich-text";

export const SITE_LOCALES = ["en", "ar"] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];
export const SITE_PUBLICATION_STATUSES = ["draft", "published"] as const;
export type SitePublicationStatus = (typeof SITE_PUBLICATION_STATUSES)[number];
export const SITE_HOME_SLUG = "home";
export const SITE_POSTS_PAGE_SIZE = 10;
export const SITE_MEDIA_BYTES = 10 * 1024 * 1024;

const id = v.pipe(v.string(), v.uuid());
const text = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));
const requiredText = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const revision = v.pipe(v.number(), v.integer(), v.minValue(0));
const safeUrl = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(2048),
  v.check(isSafeContentUrl, "validation.url"),
);

export const siteSlugSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(80),
  v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "validation.slug"),
);
export const siteLocaleSchema = v.picklist(SITE_LOCALES);

export const socialLinkSchema = v.object({
  label: requiredText(40),
  url: safeUrl,
});
export type SocialLink = v.InferOutput<typeof socialLinkSchema>;

export const saveSiteSettingsSchema = v.object({
  expectedRevision: revision,
  tagline: text(255),
  taglineAr: text(255),
  primaryColor: v.pipe(
    v.string(),
    v.regex(/^#[0-9a-fA-F]{6}$/, "validation.color"),
  ),
  logoFileId: v.nullable(id),
  contactEmail: v.union([v.literal(""), v.pipe(v.string(), v.email())]),
  contactPhone: text(40),
  address: text(500),
  mapUrl: v.union([v.literal(""), safeUrl]),
  socialLinks: v.pipe(v.array(socialLinkSchema), v.maxLength(8)),
  defaultLocale: siteLocaleSchema,
  isPublished: v.boolean(),
});
export type SaveSiteSettingsInput = v.InferOutput<
  typeof saveSiteSettingsSchema
>;

/** Pages are built from the newsletter blocks, so one designer serves both. */
export const pageDocumentSchema = newsletterDocumentSchema;
export type PageDocument = NewsletterDocument;

export const saveSitePageSchema = v.object({
  id,
  expectedRevision: revision,
  slug: siteSlugSchema,
  locale: siteLocaleSchema,
  title: requiredText(160),
  summary: text(500),
  navGroup: text(60),
  navOrder: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(999)),
  showInNav: v.boolean(),
  document: pageDocumentSchema,
});
export type SaveSitePageInput = v.InferOutput<typeof saveSitePageSchema>;

export const sitePageRevisionSchema = v.object({
  id,
  expectedRevision: revision,
});
export type SitePageRevisionInput = v.InferOutput<
  typeof sitePageRevisionSchema
>;

export const saveSiteCategorySchema = v.object({
  id,
  slug: siteSlugSchema,
  name: requiredText(80),
  nameAr: text(80),
  sortOrder: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(999)),
});
export type SaveSiteCategoryInput = v.InferOutput<
  typeof saveSiteCategorySchema
>;

export const saveSitePostSchema = v.object({
  id,
  expectedRevision: revision,
  slug: siteSlugSchema,
  locale: siteLocaleSchema,
  title: requiredText(200),
  summary: text(500),
  categoryId: v.nullable(id),
  coverFileId: v.nullable(id),
  document: contentDocumentSchema,
});
export type SaveSitePostInput = v.InferOutput<typeof saveSitePostSchema>;

export const publishSitePostSchema = v.object({
  id,
  expectedRevision: revision,
  /** Empty publishes now; a future instant schedules the post. */
  publishAt: v.nullable(v.pipe(v.string(), v.isoTimestamp())),
});
export type PublishSitePostInput = v.InferOutput<typeof publishSitePostSchema>;

export const sitePostsQuerySchema = v.object({
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  status: v.optional(v.picklist(["all", ...SITE_PUBLICATION_STATUSES]), "all"),
});
export type SitePostsQuery = v.InferOutput<typeof sitePostsQuerySchema>;

export const publicSiteQuerySchema = v.object({
  school: siteSlugSchema,
  locale: v.optional(siteLocaleSchema),
});
export const publicPageQuerySchema = v.object({
  ...publicSiteQuerySchema.entries,
  slug: siteSlugSchema,
});
export const publicPostsQuerySchema = v.object({
  ...publicSiteQuerySchema.entries,
  category: v.optional(v.union([v.literal(""), siteSlugSchema]), ""),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});
export type PublicSiteQuery = v.InferOutput<typeof publicSiteQuerySchema>;
export type PublicPageQuery = v.InferOutput<typeof publicPageQuerySchema>;
export type PublicPostsQuery = v.InferOutput<typeof publicPostsQuerySchema>;

export function pagePlainText(document: PageDocument): string {
  return newsletterPlainText(document);
}
export function pageAssetIds(document: PageDocument): string[] {
  return newsletterAssetIds(document);
}

/** What stops a page or post from being published, as message keys. */
export function sitePagePublishIssues(page: {
  title: string;
  document: PageDocument;
}): string[] {
  const issues: string[] = [];
  if (page.title.trim().length === 0) issues.push("site.title_required");
  if (pagePlainText(page.document).trim().length === 0)
    issues.push("site.content_required");
  return issues;
}
export function sitePostPublishIssues(post: {
  title: string;
  document: v.InferOutput<typeof contentDocumentSchema>;
}): string[] {
  const issues: string[] = [];
  if (post.title.trim().length === 0) issues.push("site.title_required");
  if (contentPlainText(post.document).trim().length === 0)
    issues.push("site.content_required");
  return issues;
}

/** A scheduled post is public once its instant has passed. */
export function isPostVisible(
  post: { status: SitePublicationStatus; publishAt: Date | null },
  now: Date,
): boolean {
  return (
    post.status === "published" &&
    post.publishAt !== null &&
    post.publishAt.getTime() <= now.getTime()
  );
}
