import * as v from "valibot";

import type { ContentDocument, ContentNode } from "./content";

import {
  contentDocumentSchema,
  contentFileIds,
  contentPlainText,
} from "./content";
import { embedProviders, isEmbedId } from "./embed";
import { isSafeContentUrl } from "./rich-text";

export const SITE_LOCALES = ["en", "ar"] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];
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
export const SECTION_TYPES = [
  "hero",
  "text",
  "imageText",
  "cards",
  "action",
  "accordion",
  "news",
  "gallery",
  "contact",
  "embed",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];
export const MAX_SECTIONS = 40;
export const SITE_POSTS_PAGE_SIZE = 10;

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const text = (max: number) => v.pipe(v.string(), v.maxLength(max));
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

/** A path inside the school's own site, or a safe address elsewhere. */
export function isSiteHref(value: string): boolean {
  if (value === "") return true;
  if (value.startsWith("/"))
    return /^\/[a-z0-9/_-]*(#[a-z0-9_-]+)?$/.test(value);
  return isSafeContentUrl(value);
}

const href = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(2048),
  v.check(isSiteHref, "site.link"),
);
const imageSchema = v.object({ fileId: v.nullable(id), alt: text(300) });
export type SiteImage = v.InferOutput<typeof imageSchema>;

export const pageSectionSchema = v.variant("type", [
  v.object({
    id,
    type: v.literal("hero"),
    heading: text(200),
    text: text(500),
    image: imageSchema,
    actionLabel: text(80),
    actionHref: href,
  }),
  v.object({
    id,
    type: v.literal("text"),
    heading: text(200),
    body: contentDocumentSchema,
  }),
  v.object({
    id,
    type: v.literal("imageText"),
    heading: text(200),
    body: contentDocumentSchema,
    image: imageSchema,
    side: v.picklist(["start", "end"]),
  }),
  v.object({
    id,
    type: v.literal("cards"),
    heading: text(200),
    items: v.pipe(
      v.array(
        v.object({
          id,
          title: text(120),
          text: text(300),
          image: imageSchema,
          href,
        }),
      ),
      v.maxLength(12),
    ),
  }),
  v.object({
    id,
    type: v.literal("action"),
    heading: text(200),
    text: text(500),
    actionLabel: text(80),
    actionHref: href,
  }),
  v.object({
    id,
    type: v.literal("accordion"),
    heading: text(200),
    items: v.pipe(
      v.array(v.object({ id, title: text(200), text: text(2000) })),
      v.maxLength(30),
    ),
  }),
  v.object({
    id,
    type: v.literal("news"),
    heading: text(200),
    count: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(12)),
  }),
  v.object({
    id,
    type: v.literal("gallery"),
    heading: text(200),
    images: v.pipe(
      v.array(v.object({ id, fileId: id, alt: text(300) })),
      v.maxLength(24),
    ),
  }),
  v.object({
    id,
    type: v.literal("contact"),
    heading: text(200),
    text: text(500),
  }),
  v.pipe(
    v.object({
      id,
      type: v.literal("embed"),
      heading: text(200),
      provider: v.picklist(embedProviders),
      embedId: text(200),
    }),
    v.check(
      (section) => isEmbedId(section.provider, section.embedId),
      "site.embed",
    ),
  ),
]);
export type PageSection = v.InferOutput<typeof pageSectionSchema>;
export type SectionOf<T extends SectionType> = Extract<
  PageSection,
  { type: T }
>;

/**
 * The sections of one language of a page. In a translation, `reviewed` names
 * the sections a person has checked against the original.
 */
export const pageContentSchema = v.pipe(
  v.object({
    sections: v.pipe(v.array(pageSectionSchema), v.maxLength(MAX_SECTIONS)),
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

function emptyBody(): ContentDocument {
  return {
    root: {
      type: "root",
      version: 1,
      children: [{ type: "paragraph", version: 1, children: [] }],
    },
  };
}

const noImage = (): SiteImage => ({ fileId: null, alt: "" });

const BLANK: { [K in SectionType]: (sectionId: string) => SectionOf<K> } = {
  hero: (sectionId) => ({
    id: sectionId,
    type: "hero",
    heading: "",
    text: "",
    image: noImage(),
    actionLabel: "",
    actionHref: "",
  }),
  text: (sectionId) => ({
    id: sectionId,
    type: "text",
    heading: "",
    body: emptyBody(),
  }),
  imageText: (sectionId) => ({
    id: sectionId,
    type: "imageText",
    heading: "",
    body: emptyBody(),
    image: noImage(),
    side: "start",
  }),
  cards: (sectionId) => ({
    id: sectionId,
    type: "cards",
    heading: "",
    items: [],
  }),
  action: (sectionId) => ({
    id: sectionId,
    type: "action",
    heading: "",
    text: "",
    actionLabel: "",
    actionHref: "",
  }),
  accordion: (sectionId) => ({
    id: sectionId,
    type: "accordion",
    heading: "",
    items: [],
  }),
  news: (sectionId) => ({ id: sectionId, type: "news", heading: "", count: 3 }),
  gallery: (sectionId) => ({
    id: sectionId,
    type: "gallery",
    heading: "",
    images: [],
  }),
  contact: (sectionId) => ({
    id: sectionId,
    type: "contact",
    heading: "",
    text: "",
  }),
  embed: (sectionId) => ({
    id: sectionId,
    type: "embed",
    heading: "",
    provider: "youtube",
    embedId: "",
  }),
};

export function newSection(type: SectionType): PageSection {
  return BLANK[type](crypto.randomUUID());
}

/** Every piece of wording in a section, in reading order. */
export function sectionWords(section: PageSection): string[] {
  const words = [section.heading];
  if ("text" in section) words.push(section.text);
  if ("body" in section) words.push(contentPlainText(section.body));
  if ("actionLabel" in section) words.push(section.actionLabel);
  if ("items" in section)
    for (const entry of section.items) words.push(entry.title, entry.text);
  if ("images" in section)
    for (const image of section.images) words.push(image.alt);
  return words;
}

export const sectionWritten = (section: PageSection) =>
  sectionWords(section).some((words) => words.trim() !== "");

export function pagePlainText(content: PageContent): string {
  return content.sections
    .flatMap(sectionWords)
    .filter((words) => words.trim() !== "")
    .join("\n\n");
}

export function pageFileIds(content: PageContent): string[] {
  const ids = new Set<string>();
  for (const section of content.sections) {
    if ("image" in section && section.image.fileId)
      ids.add(section.image.fileId);
    if ("body" in section)
      for (const fileId of contentFileIds(section.body)) ids.add(fileId);
    if (section.type === "cards")
      for (const item of section.items)
        if (item.image.fileId) ids.add(item.image.fileId);
    if (section.type === "gallery")
      for (const image of section.images) ids.add(image.fileId);
  }
  return [...ids];
}

/**
 * The translation's wording over the original's structure: pictures, links,
 * layout and counts always come from the original, so the two languages can
 * differ only in words.
 */
const alt = (image: SiteImage, other: SiteImage) => ({
  fileId: image.fileId,
  alt: other.alt,
});

export function overlay(
  original: PageSection,
  translated: PageSection | undefined,
): PageSection {
  if (!translated || translated.type !== original.type) return original;
  switch (original.type) {
    case "hero": {
      const other = translated as SectionOf<"hero">;
      return {
        ...original,
        heading: other.heading,
        text: other.text,
        actionLabel: other.actionLabel,
        image: alt(original.image, other.image),
      };
    }
    case "action": {
      const other = translated as SectionOf<"action">;
      return {
        ...original,
        heading: other.heading,
        text: other.text,
        actionLabel: other.actionLabel,
      };
    }
    case "text": {
      const other = translated as SectionOf<"text">;
      return { ...original, heading: other.heading, body: other.body };
    }
    case "imageText": {
      const other = translated as SectionOf<"imageText">;
      return {
        ...original,
        heading: other.heading,
        body: other.body,
        image: alt(original.image, other.image),
      };
    }
    case "cards": {
      const other = translated as SectionOf<"cards">;
      const byId = new Map(other.items.map((item) => [item.id, item]));
      return {
        ...original,
        heading: other.heading,
        items: original.items.map((item) => {
          const match = byId.get(item.id);
          return match
            ? {
                ...item,
                title: match.title,
                text: match.text,
                image: alt(item.image, match.image),
              }
            : {
                ...item,
                title: "",
                text: "",
                image: { fileId: item.image.fileId, alt: "" },
              };
        }),
      };
    }
    case "accordion": {
      const other = translated as SectionOf<"accordion">;
      const byId = new Map(other.items.map((item) => [item.id, item]));
      return {
        ...original,
        heading: other.heading,
        items: original.items.map((item) => {
          const match = byId.get(item.id);
          return {
            ...item,
            title: match?.title ?? "",
            text: match?.text ?? "",
          };
        }),
      };
    }
    case "gallery": {
      const other = translated as SectionOf<"gallery">;
      const byId = new Map(other.images.map((image) => [image.id, image]));
      return {
        ...original,
        heading: other.heading,
        images: original.images.map((image) => ({
          ...image,
          alt: byId.get(image.id)?.alt ?? "",
        })),
      };
    }
    case "contact": {
      const other = translated as SectionOf<"contact">;
      return { ...original, heading: other.heading, text: other.text };
    }
    case "news":
    case "embed":
      return { ...original, heading: translated.heading };
  }
  return original;
}

/** A section's structure with none of its words, where a translation starts. */
export function wordless(section: PageSection): PageSection {
  return overlay(section, BLANK[section.type](section.id));
}

/**
 * Whether a translation says everything its original says: every piece of
 * wording written in the original is written in the translation too.
 */
export function sectionComplete(
  original: PageSection,
  translated: PageSection | undefined,
): boolean {
  if (!translated) return !sectionWritten(original);
  const theirs = sectionWords(overlay(original, translated));
  return sectionWords(original).every(
    (words, index) =>
      words.trim() === "" || (theirs[index] ?? "").trim() !== "",
  );
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
 * language it is shown in so screen readers pronounce it right.
 */
export function localizedSections(
  original: PageContent,
  translation: PageContent | null,
  primary: SiteLocale,
  locale: SiteLocale,
): { section: PageSection; locale: SiteLocale }[] {
  if (locale === primary || !translation)
    return original.sections.map((section) => ({ section, locale: primary }));
  const byId = new Map(
    translation.sections.map((section) => [section.id, section]),
  );
  return original.sections.map((section) => {
    const match = byId.get(section.id);
    return match && sectionWritten(match) && sectionComplete(section, match)
      ? { section: overlay(section, match), locale }
      : { section, locale: primary };
  });
}

const VAGUE_LINKS = new Set([
  "click here",
  "here",
  "read more",
  "more",
  "link",
  "this",
  "click",
  "اضغط هنا",
  "انقر هنا",
  "هنا",
  "المزيد",
  "اقرأ المزيد",
  "رابط",
]);

export const isVagueLink = (label: string) =>
  VAGUE_LINKS.has(
    label
      .trim()
      .toLowerCase()
      .replace(/[.!…:]+$/, ""),
  );

export type SiteIssueCode = "alt" | "heading" | "link" | "action";
export interface SiteIssue {
  sectionId: string;
  code: SiteIssueCode;
}

function bodyIssues(body: ContentDocument): SiteIssueCode[] {
  const found = new Set<SiteIssueCode>();
  const pending: ContentNode[] = [body.root];
  for (let node = pending.pop(); node; node = pending.pop()) {
    if (node.type === "heading" && node.tag === "h1") found.add("heading");
    if (node.type === "image" && !node.alt?.trim()) found.add("alt");
    if (node.type === "link" || node.type === "autolink") {
      const label = (node.children ?? [])
        .map((child) => child.text ?? "")
        .join("");
      if (isVagueLink(label)) found.add("link");
    }
    if (node.children) pending.push(...node.children);
  }
  return [...found];
}

const missingAlt = (image: SiteImage) =>
  image.fileId !== null && !image.alt.trim();
const actionIssue = (label: string, target: string) =>
  label.trim() !== "" && target === ""
    ? "action"
    : label.trim() === "" && target !== ""
      ? "action"
      : isVagueLink(label)
        ? "link"
        : null;

/**
 * What stops a page going out in one language: a picture without a
 * description, a heading competing with the page title (the page's only
 * first-level heading), or a link that says nothing about where it goes.
 */
export function sectionIssues(section: PageSection): SiteIssueCode[] {
  const found = new Set<SiteIssueCode>();
  const add = (code: SiteIssueCode | null) => code && found.add(code);
  switch (section.type) {
    case "hero":
      if (missingAlt(section.image)) found.add("alt");
      add(actionIssue(section.actionLabel, section.actionHref));
      break;
    case "action":
      add(actionIssue(section.actionLabel, section.actionHref));
      break;
    case "text":
      bodyIssues(section.body).forEach(add);
      break;
    case "imageText":
      if (missingAlt(section.image)) found.add("alt");
      bodyIssues(section.body).forEach(add);
      break;
    case "cards":
      if (section.items.some((item) => missingAlt(item.image)))
        found.add("alt");
      break;
    case "gallery":
      if (section.images.some((image) => !image.alt.trim())) found.add("alt");
      break;
    case "accordion":
    case "news":
    case "contact":
    case "embed":
      break;
  }
  return [...found];
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
