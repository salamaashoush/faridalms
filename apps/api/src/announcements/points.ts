import type { BroadcastRow } from "@faridalms/database/stores/broadcasts";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { SQL } from "drizzle-orm";

import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";
import type { ModuleScope } from "../core/extension";

import { contributionsTo, point } from "../core/extension";

/**
 * Where a module puts announcements beyond their audience, before
 * everyone at the school and whoever else it reaches: the website, say.
 * It keeps what it needs under its key, sent with the announcement from
 * the editor, and checks and writes its own copy as the announcement goes
 * out and takes it down when the announcement does.
 */
export interface AnnouncementCopy {
  key: string;
  /** Checks and keeps what the editor sent under the key; null takes the copy away. */
  save(
    context: UnitContext,
    input: { row: BroadcastRow; value: unknown },
  ): Promise<void>;
  /** The announcements it keeps a copy of, as a subquery of their ids. */
  opened(scope: { tenantId: string; schoolId: string }): SQL;
  /** Those of them that come first in the office's list, as a subquery of their ids. */
  first?(scope: { tenantId: string; schoolId: string }): SQL;
  /** Which of these announcements it keeps a copy of. */
  opens(context: UnitContext, ids: readonly string[]): Promise<Set<string>>;
  /** What stops its copy going out, in each language it is written in. */
  issues(
    context: UnitContext,
    input: {
      row: BroadcastRow;
      body: ContentDocument;
      other: ContentDocument | null;
    },
  ): Promise<Record<ContentLocale, string[]>>;
  /** The announcement went out: its copy is written, or taken away where it keeps none. */
  published(
    context: UnitContext,
    input: {
      row: BroadcastRow;
      body: ContentDocument;
      other: ContentDocument | null;
      publishedAt: string;
    },
  ): Promise<void>;
  /** The announcement was taken back: so is its copy. */
  withdrawn(context: UnitContext, row: BroadcastRow): Promise<void>;
  /** A new draft was made from `source`. */
  duplicated(
    context: UnitContext,
    input: { source: BroadcastRow; created: { id: string } },
  ): Promise<void>;
}

export const announcementCopies = point<AnnouncementCopy>(
  "announcement copies",
);

/** The copies of the modules on, refusing a value given for one no module on keeps. */
export async function copiesFor(
  context: UnitContext,
  values: Readonly<Record<string, unknown>>,
): Promise<AnnouncementCopy[]> {
  const offered = await contributionsTo(context, announcementCopies);
  for (const key of Object.keys(values))
    if (!offered.some((copy) => copy.key === key))
      throw new ORPCError("BAD_REQUEST", {
        message: "announcements.part_unknown",
      });
  return offered;
}

/** The keys of the copies kept of each announcement, by announcement. */
export async function copiesOf(
  context: UnitContext,
  ids: readonly string[],
): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const copy of await contributionsTo(context, announcementCopies))
    for (const id of await copy.opens(context, ids))
      found.get(id)?.push(copy.key);
  return found;
}

/** The subqueries of the announcements the modules on open to everyone at the school. */
export async function openedAnnouncements(scope: ModuleScope): Promise<SQL[]> {
  return (await contributionsTo(scope, announcementCopies)).map((copy) =>
    copy.opened(scope),
  );
}

/** The subqueries of the announcements the modules on put first in the office's list. */
export async function firstAnnouncements(scope: ModuleScope): Promise<SQL[]> {
  return (await contributionsTo(scope, announcementCopies)).flatMap((copy) =>
    copy.first ? [copy.first(scope)] : [],
  );
}
