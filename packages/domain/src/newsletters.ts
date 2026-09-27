import * as v from "valibot";

import { audienceSchema, MANAGE_TABS } from "./announcements";
import {
  contentDocumentSchema,
  contentFileIds,
  contentPlainText,
} from "./content";

export const NEWSLETTER_LOCALES = ["en", "ar"] as const;
export type NewsletterLocale = (typeof NEWSLETTER_LOCALES)[number];
export const MAX_SECTIONS = 30;

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");

export const newsletterSectionSchema = v.object({
  id,
  heading: v.pipe(v.string(), v.maxLength(200)),
  body: contentDocumentSchema,
});
export type NewsletterSection = v.InferOutput<typeof newsletterSectionSchema>;

/**
 * The sections of one language of an edition. In a translation, `reviewed`
 * names the sections a person has checked against the original; a section
 * the original has and the translation lacks is missing.
 */
export const newsletterContentSchema = v.pipe(
  v.object({
    sections: v.pipe(
      v.array(newsletterSectionSchema),
      v.maxLength(MAX_SECTIONS),
    ),
    reviewed: v.optional(v.pipe(v.array(id), v.maxLength(MAX_SECTIONS)), []),
  }),
  v.check(
    (content) =>
      new Set(content.sections.map((section) => section.id)).size ===
      content.sections.length,
    "newsletters.duplicate_section",
  ),
);
export type NewsletterContent = v.InferOutput<typeof newsletterContentSchema>;

export function editionPlainText(content: NewsletterContent): string {
  return content.sections
    .flatMap((section) => [section.heading, contentPlainText(section.body)])
    .filter(Boolean)
    .join("\n\n");
}

export function editionFileIds(content: NewsletterContent): string[] {
  return [
    ...new Set(
      content.sections.flatMap((section) => contentFileIds(section.body)),
    ),
  ];
}

export const sectionWritten = (section: {
  heading: string;
  body: NewsletterSection["body"];
}) =>
  section.heading.trim() !== "" || contentPlainText(section.body).trim() !== "";

/**
 * The written sections of the original a translation lacks, and those it has
 * but nobody has checked.
 */
export function translationGaps(
  original: NewsletterContent,
  translation: NewsletterContent | null,
): { missing: string[]; unreviewed: string[] } {
  const translated = new Set(
    (translation?.sections ?? [])
      .filter(sectionWritten)
      .map((section) => section.id),
  );
  const reviewed = new Set(translation?.reviewed ?? []);
  const ids = original.sections
    .filter(sectionWritten)
    .map((section) => section.id);
  return {
    missing: ids.filter((sectionId) => !translated.has(sectionId)),
    unreviewed: ids.filter(
      (sectionId) => translated.has(sectionId) && !reviewed.has(sectionId),
    ),
  };
}

/**
 * The translation cut to the original's sections in the original's order, so
 * a section removed from the original cannot linger in the other language.
 */
export function alignTranslation(
  original: NewsletterContent,
  translation: NewsletterContent,
): NewsletterContent {
  const byId = new Map(
    translation.sections.map((section) => [section.id, section]),
  );
  const sections = original.sections.flatMap((section) => {
    const match = byId.get(section.id);
    return match ? [match] : [];
  });
  const kept = new Set(sections.map((section) => section.id));
  return {
    sections,
    reviewed: translation.reviewed.filter((sectionId) => kept.has(sectionId)),
  };
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
    content: v.pipe(
      newsletterContentSchema,
      v.check(
        (content) => content.sections.length > 0,
        "newsletters.no_sections",
      ),
    ),
    translation: v.nullable(newsletterContentSchema),
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

export const newsletterRefSchema = v.object({
  id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
