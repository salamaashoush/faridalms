import * as v from "valibot";

import type { ContentDocument } from "./content";
import type {
  PageSection,
  SiteIssue,
  SiteIssueCode,
  SiteLocale,
} from "./site-sections";

import { pictureEntries } from "./commons";
import { isSafeContentUrl } from "./content";
import { enquirerFields, MAX_QUESTIONS } from "./enquiries";
import { pageField } from "./paging";
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
import { isPageAddress, isRedirectFrom, redirectPath } from "./site-seo";
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

/** A path on the school's site or a web address elsewhere; empty for none. */
const addressSchema = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(2048),
  v.check((value) => value === "" || isPageAddress(value), "site.link"),
);

export const socialPictureSchema = v.object({
  fileId: pictureEntries.fileId,
  alt: pictureEntries.alt,
});
export type SocialPicture = v.InferOutput<typeof socialPictureSchema>;

/**
 * The sections of one language of a page, plus how it presents itself
 * outside the site: its search description, the picture a shared link
 * shows, and the address search engines should treat as its own, empty for
 * the page's. In a translation, `reviewed` names the sections a person has
 * checked against the original.
 */
export const pageContentSchema = v.pipe(
  v.object({
    sections: v.pipe(v.array(pageSectionSchema), v.maxLength(MAX_SECTIONS)),
    description: v.optional(v.pipe(v.string(), v.maxLength(300)), ""),
    socialPicture: v.optional(socialPictureSchema, () => ({
      fileId: null,
      alt: "",
    })),
    canonical: v.optional(addressSchema, ""),
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

export function pagePlainText(content: PageContent): string {
  return [content.description, ...content.sections.flatMap(sectionWords)]
    .filter((words) => words.trim() !== "")
    .join("\n\n");
}

export function pageFileIds(content: PageContent): string[] {
  return [
    ...new Set([
      ...content.sections.flatMap(sectionFileIds),
      ...(content.socialPicture.fileId ? [content.socialPicture.fileId] : []),
    ]),
  ];
}

/** A page with nothing in it yet, in one language. */
export const blankPage = (sections: PageSection[] = []): PageContent => ({
  sections,
  description: "",
  socialPicture: { fileId: null, alt: "" },
  canonical: "",
  reviewed: [],
});

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
    socialPicture: translation.socialPicture,
    canonical: translation.canonical,
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

export type PageWarningCode = "description";

/**
 * What a page may go out without, though it should not, in each language it
 * is published in. A warning never stops publishing; a language without a
 * description of its own shows the first language's.
 */
export function pageWarnings(
  content: PageContent,
  translation: PageContent | null,
  locales: readonly SiteLocale[],
  primary: SiteLocale,
): { locale: SiteLocale; code: PageWarningCode }[] {
  return locales.flatMap((locale) => {
    const words = locale === primary ? content : translation;
    return words?.description.trim()
      ? []
      : [{ locale, code: "description" as const }];
  });
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

/**
 * What a visitor sends from a form section. `website` is a field people
 * never see, so anything in it came from a script; `elapsed` is how long the
 * form was open, and a person takes more than a moment to fill it. `answers`
 * holds a response to each of the school's own questions by the question's
 * id, checked against the form by `readFormAnswers`, and `turnstile` the challenge's
 * token where the site is protected by one.
 */
export const enquirySchema = v.object({
  school: v.pipe(v.string(), v.maxLength(80)),
  locale: v.picklist(SITE_LOCALES),
  page: v.pipe(v.string(), v.maxLength(80)),
  sectionId: id,
  ...enquirerFields,
  answers: v.optional(
    v.pipe(
      v.record(id, v.unknown()),
      v.check(
        (answers) => Object.keys(answers).length <= MAX_QUESTIONS,
        "site.form",
      ),
    ),
    {},
  ),
  website: v.optional(v.pipe(v.string(), v.maxLength(200)), ""),
  elapsed: v.pipe(v.number(), v.integer(), v.minValue(0)),
  turnstile: v.optional(v.pipe(v.string(), v.maxLength(2048)), ""),
});
export type Enquiry = v.InferOutput<typeof enquirySchema>;

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
  /** False keeps the page out of search engines and the sitemap. */
  indexed: v.optional(v.boolean(), true),
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

/** What can be done to many pages at once from the page list. */
export const PAGE_BATCH_ACTIONS = [
  "publish",
  "unpublish",
  "showInMenu",
  "hideFromMenu",
  "remove",
] as const;
export type PageBatchAction = (typeof PAGE_BATCH_ACTIONS)[number];

/**
 * One action on several pages, done for all of them or for none: a page
 * that cannot take it (a check fails, someone else changed it) leaves every
 * page as it was and says which one stopped it.
 */
export const pageBatchSchema = v.object({
  action: v.picklist(PAGE_BATCH_ACTIONS),
  pages: v.pipe(
    v.array(siteRefSchema),
    v.minLength(1),
    v.maxLength(100),
    v.check(
      (pages) => new Set(pages.map((page) => page.id)).size === pages.length,
      "site.batch_duplicate",
    ),
  ),
});
export type PageBatch = v.InferOutput<typeof pageBatchSchema>;

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

/**
 * An old address of the school's site sent on to one of its pages, by id so
 * renaming the page keeps the redirect pointing at it, or to any other
 * address.
 */
export const saveRedirectSchema = v.pipe(
  v.object({
    id: optionalId,
    expectedVersion: version(0),
    from: v.pipe(
      v.string(),
      v.maxLength(2048),
      v.check(isRedirectFrom, "site.redirect"),
      v.transform((value) => redirectPath(value) ?? value),
    ),
    toPageId: optionalId,
    toUrl: v.optional(addressSchema, ""),
  }),
  v.check(
    (input) => (input.toPageId === "") !== (input.toUrl === ""),
    "site.redirect",
  ),
);
export type SaveRedirect = v.InferOutput<typeof saveRedirectSchema>;

export const saveCategorySchema = v.object({
  id: optionalId,
  expectedVersion: version(0),
  slug: siteSlugSchema,
  nameEn: v.pipe(v.string(), v.trim(), v.maxLength(100)),
  nameAr: v.pipe(v.string(), v.trim(), v.maxLength(100)),
});

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
  page: pageField,
});
export const publicPostSchema = v.object({
  school,
  locale,
  slug: siteSlugSchema,
});
export const publicSitemapSchema = v.object({ school });
export const publicRedirectSchema = v.object({
  school,
  /** The path a visitor asked for, which found nothing. */
  path: v.pipe(v.string(), v.maxLength(2048)),
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
