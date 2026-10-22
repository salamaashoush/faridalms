import type { ContentDocument } from "@faridalms/domain/content";
import type { PageContent } from "@faridalms/domain/website";

import { sharedContents } from "@faridalms/database/stores/shared";
import { inlineShared, sharedIdsOf } from "@faridalms/domain/shared";
import { mapSectionBodies } from "@faridalms/domain/site-sections";

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
