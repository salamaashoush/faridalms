import type { ContentDocument } from "@faridalms/domain/content";
import type { SavedSection } from "@faridalms/domain/saved-sections";
import type { SiteLocale } from "@faridalms/domain/site-sections";
import type { PageContent } from "@faridalms/domain/website";

import { sharedContents } from "@faridalms/database/stores/shared";
import {
  resolveSharedSections,
  savedSectionSchema,
  sharedSectionIds,
} from "@faridalms/domain/saved-sections";
import { inlineShared, sharedIdsOf } from "@faridalms/domain/shared";
import { mapSectionBodies } from "@faridalms/domain/site-sections";
import * as v from "valibot";

import type { UnitContext } from "./context";

/**
 * Writes out the shared blocks some documents show, as they stand now, for
 * copies that leave the school's own pages: the website, an export. The
 * answer writes them into any one of the documents.
 */
export async function sharedInliner(
  context: UnitContext,
  documents: readonly ContentDocument[],
): Promise<(document: ContentDocument) => ContentDocument> {
  const ids = [...new Set(documents.flatMap(sharedIdsOf))];
  if (ids.length === 0) return (document) => document;
  const rows = await sharedContents(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    ids,
  });
  const blocks = new Map(
    rows.map((row) => [row.id, row.content as unknown as ContentDocument]),
  );
  return (document) => inlineShared(document, blocks);
}

type Reviser = (context: UnitContext, sharedId: string) => Promise<number>;
let reviser: Reviser | null = null;

/** The website registers how its published pages follow a shared section that changed. */
export function registerLiveReviser(revise: Reviser) {
  reviser = revise;
}

/**
 * Brings every published page showing a shared section up to date with it,
 * answering how many there were.
 */
export function reviseLivePages(context: UnitContext, sharedId: string) {
  if (!reviser) throw new Error("the website has not registered its reviser");
  return reviser(context, sharedId);
}

/** The shared sections of the viewer's school among these, each as it stands now. */
export async function sharedSections(
  context: UnitContext,
  ids: readonly string[],
): Promise<Map<string, SavedSection>> {
  const rows = await sharedContents(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    ids,
    kind: "section",
  });
  const kept = new Map<string, SavedSection>();
  for (const row of rows) {
    const parsed = v.safeParse(savedSectionSchema, row.content);
    if (parsed.success) kept.set(row.id, parsed.output);
  }
  return kept;
}

/**
 * A page in both languages with each shared section it names drawn as it
 * stands now; those since taken out are listed as gone.
 */
export async function withSharedSections(
  context: UnitContext,
  content: PageContent,
  translation: PageContent | null,
  primary: SiteLocale,
) {
  const ids = sharedSectionIds(content);
  if (ids.length === 0) return { content, translation, gone: [] as string[] };
  return resolveSharedSections(
    content,
    translation,
    await sharedSections(context, ids),
    primary,
  );
}

/** A website page with the shared blocks in its bodies written out. */
export async function inlinePageShared(
  context: UnitContext,
  content: PageContent,
): Promise<PageContent> {
  const bodies: ContentDocument[] = [];
  for (const section of content.sections)
    mapSectionBodies(section, (body) => {
      bodies.push(body);
      return body;
    });
  const inline = await sharedInliner(context, bodies);
  return {
    ...content,
    sections: content.sections.map((section) =>
      mapSectionBodies(section, inline),
    ),
  };
}
