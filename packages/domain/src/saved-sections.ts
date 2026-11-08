import * as v from "valibot";

import type { ContentDocument, ContentNode } from "./content";
import type { PageSection, SiteLocale } from "./site-sections";
import type { PageContent } from "./website";

import {
  mapSectionBodies,
  pageSectionSchema,
  sectionFileIds,
  sectionWords,
  SITE_LOCALES,
} from "./site-sections";

/**
 * A website section kept to use again, as a library template or a shared
 * section: the section in the language it was written in, and the words of
 * the other language over the same structure, when the site has them.
 */
export const savedSectionSchema = v.pipe(
  v.object({
    locale: v.picklist(SITE_LOCALES),
    section: pageSectionSchema,
    translation: v.nullable(pageSectionSchema),
  }),
  v.check(
    (saved) =>
      !saved.translation ||
      (saved.translation.id === saved.section.id &&
        saved.translation.type === saved.section.type),
    "site.saved_section",
  ),
  v.check((saved) => !holdsSharedBlock(saved), "shared.content"),
);
export type SavedSection = v.InferOutput<typeof savedSectionSchema>;

const holds = (node: ContentNode): boolean =>
  node.type === "shared" || (node.children ?? []).some(holds);

/**
 * Whether a section shows a shared block in its words. A kept section is
 * one piece to show in many places, and a shared block within it would let
 * an edit reach further than its writer sees.
 */
function holdsSharedBlock(saved: {
  section: PageSection;
  translation: PageSection | null;
}): boolean {
  let found = false;
  const look = (body: ContentDocument) => {
    if ((body.root.children ?? []).some(holds)) found = true;
    return body;
  };
  mapSectionBodies(saved.section, look);
  if (saved.translation) mapSectionBodies(saved.translation, look);
  return found;
}

/** A section as a page holds it, without naming a shared section. */
const own = (section: PageSection): PageSection => {
  const { shared: _shared, ...rest } = section;
  return rest;
};

/** A page's section, in both its languages, kept to use again. */
export function savedSectionOf(
  section: PageSection,
  translation: PageSection | null,
  locale: SiteLocale,
): SavedSection {
  return {
    locale,
    section: own(section),
    translation: translation ? own(translation) : null,
  };
}

/**
 * A kept section as a page of a site whose first language is `primary`
 * holds it: the original in that language and the words of the other. A
 * section kept while the site's first language was the other one turns
 * round, its words in the first language over the original's structure.
 */
export function sectionPair(
  saved: SavedSection,
  primary: SiteLocale,
): { content: PageSection; translation: PageSection | null } {
  if (saved.locale === primary || !saved.translation)
    return { content: saved.section, translation: saved.translation };
  return {
    content: { ...saved.section, data: saved.translation.data } as PageSection,
    translation: saved.section,
  };
}

export const savedSectionFileIds = (saved: SavedSection): string[] => [
  ...new Set([
    ...sectionFileIds(saved.section),
    ...(saved.translation ? sectionFileIds(saved.translation) : []),
  ]),
];

export const savedSectionPlainText = (saved: SavedSection): string =>
  [
    ...sectionWords(saved.section),
    ...(saved.translation ? sectionWords(saved.translation) : []),
  ]
    .filter((words) => words.trim() !== "")
    .join("\n\n");

/**
 * A section and its other language with new ids for the section and
 * every item, column and block in it, the same new id in both languages,
 * so a copy on a page never shares an id with its original.
 */
export function withFreshIds(
  section: PageSection,
  translation: PageSection | null,
): { content: PageSection; translation: PageSection | null } {
  const ids = new Map<string, string>([[section.id, crypto.randomUUID()]]);
  const fresh = (from: PageSection) =>
    JSON.parse(JSON.stringify(own(from)), (key, value: unknown) => {
      if (key !== "id" || typeof value !== "string") return value;
      const known = ids.get(value) ?? crypto.randomUUID();
      ids.set(value, known);
      return known;
    }) as PageSection;
  return {
    content: fresh(section),
    translation: translation ? fresh(translation) : null,
  };
}

/** The shared sections a page names, each once. */
export const sharedSectionIds = (content: PageContent): string[] => [
  ...new Set(
    content.sections.flatMap((section) =>
      section.shared ? [section.shared] : [],
    ),
  ),
];

/**
 * A page with each shared section it names drawn as that section stands
 * now, in both languages, keeping the page's own id for it and the name of
 * the shared section. A shared section since taken out keeps the page's
 * last copy and is listed as gone.
 */
export function resolveSharedSections(
  content: PageContent,
  translation: PageContent | null,
  kept: ReadonlyMap<string, SavedSection>,
  primary: SiteLocale,
): {
  content: PageContent;
  translation: PageContent | null;
  gone: string[];
} {
  const gone: string[] = [];
  const words = new Map<string, PageSection | null>();
  const sections = content.sections.map((section) => {
    if (!section.shared) return section;
    const saved = kept.get(section.shared);
    if (!saved) {
      gone.push(section.id);
      return section;
    }
    const pair = sectionPair(saved, primary);
    words.set(
      section.id,
      pair.translation
        ? {
            ...pair.translation,
            id: section.id,
            shared: section.shared,
          }
        : null,
    );
    return {
      ...pair.content,
      id: section.id,
      shared: section.shared,
    };
  });
  if (!translation)
    return { content: { ...content, sections }, translation, gone };
  const theirs = translation.sections
    .filter((section) => !words.has(section.id))
    .concat(
      [...words.values()].filter(
        (section): section is PageSection => section !== null,
      ),
    );
  const order = new Map(sections.map((section, index) => [section.id, index]));
  return {
    content: { ...content, sections },
    translation: {
      ...translation,
      sections: theirs.toSorted(
        (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
      ),
    },
    gone,
  };
}

/** A page without the sections listed, in both languages, for a copy that leaves out what is gone. */
export function withoutSections(
  content: PageContent,
  translation: PageContent | null,
  ids: readonly string[],
): { content: PageContent; translation: PageContent | null } {
  if (ids.length === 0) return { content, translation };
  const left = (page: PageContent) => ({
    ...page,
    sections: page.sections.filter((section) => !ids.includes(section.id)),
  });
  return {
    content: left(content),
    translation: translation ? left(translation) : null,
  };
}
