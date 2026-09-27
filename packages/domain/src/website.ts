import * as v from "valibot";

import type { ContentDocument } from "./content";
import type {
  PageSection,
  SiteIssue,
  SiteIssueCode,
  SiteLocale,
} from "./site-sections";

import { contentDocumentSchema, contentPlainText } from "./content";
import { isSafeContentUrl } from "./rich-text";
import {
  bodyIssues,
  overlay,
  pageSectionSchema,
  sectionComplete,
  sectionFileIds,
  sectionIssues,
  sectionWords,
  sectionWritten,
  SITE_LOCALES,
} from "./site-sections";
import { STARTER_IDS } from "./site-templates";
import { siteChromeSchema, siteThemeSchema } from "./site-theme";

export { isSiteHref, isVagueLink, MAX_BUTTON_LABEL } from "./site-links";
export * from "./site-sections";

export const SITE_STATES = ["draft", "published", "archived"] as const;
export type SiteState = (typeof SITE_STATES)[number];
export const BANNER_TONES = ["info", "warning", "danger"] as const;
export type BannerTone = (typeof BANNER_TONES)[number];
export const SOCIAL_KINDS = [
  "facebook",
  "instagram",
  "x",
  "youtube",
  "linkedin",
  "tiktok",
  "whatsapp",
] as const;
export type SocialKind = (typeof SOCIAL_KINDS)[number];
export const MAX_SECTIONS = 40;
export const SITE_POSTS_PAGE_SIZE = 10;

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const version = (min: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min));
const instantOrNow = v.optional(
  v.union([v.literal(""), v.pipe(v.string(), v.isoTimestamp())]),
  "",
);

export const siteSlugSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.minLength(1),
  v.maxLength(80),
  v.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "site.slug"),
);

/**
 * The sections of one language of a page, plus its search description. In a
 * translation, `reviewed` names the sections a person has checked against
 * the original.
 */
export const pageContentSchema = v.pipe(
  v.object({
    sections: v.pipe(v.array(pageSectionSchema), v.maxLength(MAX_SECTIONS)),
    description: v.optional(v.pipe(v.string(), v.maxLength(300)), ""),
    reviewed: v.optional(v.pipe(v.array(id), v.maxLength(MAX_SECTIONS)), []),
  }),
  v.check(
    (content) =>
      new Set(content.sections.map((section) => section.id)).size ===
      content.sections.length,
    "site.duplicate_section",
  ),
);
export type PageContent = v.InferOutput<typeof pageContentSchema>;

/** A post's body in one language; a translation says whether someone checked it. */
export const postContentSchema = v.object({
  body: contentDocumentSchema,
  reviewed: v.optional(v.boolean(), false),
});
export type PostContent = v.InferOutput<typeof postContentSchema>;

export function pagePlainText(content: PageContent): string {
  return [content.description, ...content.sections.flatMap(sectionWords)]
    .filter((words) => words.trim() !== "")
    .join("\n\n");
}

export function pageFileIds(content: PageContent): string[] {
  return [...new Set(content.sections.flatMap(sectionFileIds))];
}

/**
 * The translation cut to the original's sections in the original's order,
 * with the original's structure, so nothing removed from the original lingers.
 */
export function alignTranslation(
  original: PageContent,
  translation: PageContent,
): PageContent {
  const byId = new Map(
    translation.sections.map((section) => [section.id, section]),
  );
  const sections = original.sections.flatMap((section) => {
    const match = byId.get(section.id);
    return match ? [overlay(section, match)] : [];
  });
  const kept = new Set(sections.map((section) => section.id));
  return {
    sections,
    description: translation.description,
    reviewed: translation.reviewed.filter((sectionId) => kept.has(sectionId)),
  };
}

/**
 * The written sections of the original a translation lacks or only partly
 * says, and those it says fully but nobody has checked.
 */
export function translationGaps(
  original: PageContent,
  translation: PageContent | null,
) {
  const byId = new Map(
    (translation?.sections ?? []).map((section) => [section.id, section]),
  );
  const reviewed = new Set(translation?.reviewed ?? []);
  const written = original.sections.filter(sectionWritten);
  const complete = (section: PageSection) =>
    sectionComplete(section, byId.get(section.id));
  return {
    missing: written
      .filter((section) => !complete(section))
      .map((section) => section.id),
    unreviewed: written
      .filter((section) => complete(section) && !reviewed.has(section.id))
      .map((section) => section.id),
  };
}

/**
 * A page in one language for visitors: each section in that language where
 * its translation is complete, otherwise in the original's, marked with the
 * language it is shown in so screen readers pronounce it right. Sections
 * hidden in a language are left out of it.
 */
export function localizedSections(
  original: PageContent,
  translation: PageContent | null,
  primary: SiteLocale,
  locale: SiteLocale,
): { section: PageSection; locale: SiteLocale }[] {
  const shown = original.sections.filter(
    (section) => !section.style.hideIn.includes(locale),
  );
  if (locale === primary || !translation)
    return shown.map((section) => ({ section, locale: primary }));
  const byId = new Map(
    translation.sections.map((section) => [section.id, section]),
  );
  return shown.map((section) => {
    const match = byId.get(section.id);
    return match && sectionWritten(match) && sectionComplete(section, match)
      ? { section: overlay(section, match), locale }
      : { section, locale: primary };
  });
}

export function pageIssues(sections: PageSection[]): SiteIssue[] {
  return sections.flatMap((section) =>
    sectionIssues(section).map((code) => ({ sectionId: section.id, code })),
  );
}

export function postIssues(post: {
  coverFileId: string | null;
  coverAlt: string;
  body: ContentDocument;
}): SiteIssueCode[] {
  const found = new Set(bodyIssues(post.body));
  if (post.coverFileId && !post.coverAlt.trim()) found.add("alt");
  return [...found];
}

export const postWords = (content: PostContent) =>
  contentPlainText(content.body);

export const socialLinkSchema = v.object({
  kind: v.picklist(SOCIAL_KINDS),
  url: v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(2048),
    v.check(
      (value) => value.startsWith("https://") && isSafeContentUrl(value),
      "site.link",
    ),
  ),
});
export type SocialLink = v.InferOutput<typeof socialLinkSchema>;

export const saveSettingsSchema = v.object({
  expectedVersion: version(0),
  theme: siteThemeSchema,
  chrome: siteChromeSchema,
  live: v.boolean(),
  primaryLocale: v.picklist(SITE_LOCALES),
  bilingual: v.boolean(),
  taglineEn: v.pipe(v.string(), v.trim(), v.maxLength(200)),
  taglineAr: v.pipe(v.string(), v.trim(), v.maxLength(200)),
  socialLinks: v.pipe(v.array(socialLinkSchema), v.maxLength(10)),
  bannerEn: v.pipe(v.string(), v.trim(), v.maxLength(300)),
  bannerAr: v.pipe(v.string(), v.trim(), v.maxLength(300)),
  bannerTone: v.picklist(BANNER_TONES),
  bannerUntil: instantOrNow,
});
export type SaveSettings = v.InferOutput<typeof saveSettingsSchema>;

const titles = {
  titleEn: v.pipe(v.string(), v.trim(), v.maxLength(200)),
  titleAr: v.pipe(v.string(), v.trim(), v.maxLength(200)),
};

export const savePageSchema = v.object({
  id: optionalId,
  expectedVersion: version(0),
  parentId: optionalId,
  slug: siteSlugSchema,
  ...titles,
  inMenu: v.boolean(),
  content: pageContentSchema,
  translation: v.nullable(pageContentSchema),
});
export type SavePage = v.InferOutput<typeof savePageSchema>;

export const publishSchema = v.object({
  id,
  expectedVersion: version(1),
  /** Empty to publish now, or when it should go live. */
  publishAt: instantOrNow,
});

export const siteRefSchema = v.object({ id, expectedVersion: version(1) });

export const applyStarterSchema = v.object({
  starter: v.picklist(STARTER_IDS),
  /** Also take the starter's theme, and its frame when the site has none yet. */
  withTheme: v.optional(v.boolean(), true),
});

export const movePageSchema = v.object({
  id,
  parentId: optionalId,
  position: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(999)),
});

export const restoreSchema = v.object({
  id,
  locale: v.picklist(SITE_LOCALES),
  documentVersion: version(1),
});

export const saveCategorySchema = v.object({
  id: optionalId,
  expectedVersion: version(0),
  slug: siteSlugSchema,
  nameEn: v.pipe(v.string(), v.trim(), v.maxLength(100)),
  nameAr: v.pipe(v.string(), v.trim(), v.maxLength(100)),
});

export const savePostSchema = v.object({
  id: optionalId,
  expectedVersion: version(0),
  categoryId: optionalId,
  slug: siteSlugSchema,
  ...titles,
  excerptEn: v.pipe(v.string(), v.trim(), v.maxLength(300)),
  excerptAr: v.pipe(v.string(), v.trim(), v.maxLength(300)),
  coverFileId: optionalId,
  coverAltEn: v.pipe(v.string(), v.trim(), v.maxLength(300)),
  coverAltAr: v.pipe(v.string(), v.trim(), v.maxLength(300)),
  pinned: v.boolean(),
  content: postContentSchema,
  translation: v.nullable(postContentSchema),
});
export type SavePost = v.InferOutput<typeof savePostSchema>;

export const publishPostSchema = v.object({
  ...publishSchema.entries,
  /** Also tell the whole school, as an announcement linking to the post. */
  announce: v.optional(v.boolean(), false),
});

export const POST_TABS = [
  "published",
  "scheduled",
  "drafts",
  "archived",
] as const;
export type PostTab = (typeof POST_TABS)[number];

export const postsQuerySchema = v.object({
  tab: v.fallback(v.optional(v.picklist(POST_TABS), "published"), "published"),
  q: v.fallback(
    v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
    "",
  ),
});
export type PostsQuery = v.InferOutput<typeof postsQuerySchema>;

const school = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
);
const locale = v.fallback(v.optional(v.picklist(SITE_LOCALES)), undefined);

export const publicSiteSchema = v.object({ school, locale });
export const publicPageSchema = v.object({
  school,
  locale,
  /** Empty for the home page. */
  slug: v.optional(v.union([v.literal(""), siteSlugSchema]), ""),
});
export const publicPostsSchema = v.object({
  school,
  locale,
  category: v.optional(v.union([v.literal(""), siteSlugSchema]), ""),
  page: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000)),
    1,
  ),
});
export const publicPostSchema = v.object({
  school,
  locale,
  slug: siteSlugSchema,
});

/** The public key a published file is served under: unguessable, readable name. */
export function publicKeyFor(name: string): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const random = crypto.getRandomValues(new Uint8Array(26));
  const token = Array.from(
    random,
    (byte) => alphabet[byte % alphabet.length],
  ).join("");
  const safe =
    name
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^[-.]+/, "")
      .slice(0, 120) || "file";
  return `p/${token}/${safe}`;
}
