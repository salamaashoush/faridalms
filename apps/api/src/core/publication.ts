import type { Cell, CellTransaction } from "@faridalms/database/context";
import type { Directory } from "@faridalms/database/directory/client";
import type {
  Host,
  HostedDocument,
} from "@faridalms/database/stores/documents";
import type { TranslatedHost } from "@faridalms/database/stores/translations";
import type { ContentDocument } from "@faridalms/domain/content";
import type {
  PublishIssue,
  PublishRules,
} from "@faridalms/domain/content-checks";
import type { ContentLocale } from "@faridalms/domain/translations";

import {
  documentOf,
  dropTranslation,
  publishedVersion,
  saveDocument,
  saveTranslation,
  snapshotPublish,
  translationOf,
} from "@faridalms/database/stores/documents";
import { subjectsWithoutConsent } from "@faridalms/database/stores/site";
import { reviewTranslation } from "@faridalms/database/stores/translations";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { publishIssues } from "@faridalms/domain/content-checks";
import { schoolDate } from "@faridalms/domain/school";
import { documentWritten, otherLocale } from "@faridalms/domain/translations";

import type { UnitContext } from "./context";
import type { ModuleScope, WorkerModules } from "./extension";
import type { NoticeScope } from "./notify";

import { placeMedia } from "../files/authorize";
import { everyTenant } from "../files/upkeep";
import { workerScope } from "./extension";
import { publishTelling, tellPublished } from "./mentions";
import { schoolZone } from "./procedure";

const contentOf = (document: HostedDocument | null): ContentDocument | null =>
  document ? (document.content as unknown as ContentDocument) : null;

/** A unit of work at one tenant, from a request or from the clock. */
interface Reader {
  tx: CellTransaction;
  tenantId: string;
}

/** A host's words as they are being written: the original and its other language. */
export async function draftWords(context: Reader, host: Host) {
  const original = await documentOf(context.tx, context.tenantId, host);
  const translation = original
    ? await translationOf(context.tx, context.tenantId, original.id)
    : null;
  return {
    original,
    translation,
    body: contentOf(original),
    other: contentOf(translation),
  };
}

/**
 * A host's words as readers last received them, in both languages, with
 * whether edits wait since. Null until it has first been published.
 */
export async function publishedWords(context: Reader, host: Host) {
  const { original, translation } = await draftWords(context, host);
  if (!original) return null;
  const [published, publishedTranslation] = await Promise.all([
    publishedVersion(context.tx, context.tenantId, original.id),
    translation
      ? publishedVersion(context.tx, context.tenantId, translation.id)
      : Promise.resolve(null),
  ]);
  if (!published) return null;
  return {
    body: published.content as unknown as ContentDocument,
    translation: publishedTranslation
      ? (publishedTranslation.content as unknown as ContentDocument)
      : null,
    // Words saved back to what went out are no change, whatever their version.
    changedSince:
      JSON.stringify(original.content) !== JSON.stringify(published.content) ||
      (translation === null
        ? publishedTranslation !== null
        : JSON.stringify(translation.content) !==
          JSON.stringify(publishedTranslation?.content ?? null)),
  };
}

/** The files a document shows, and the ones a host shows beside it. */
const filesOf = (
  documents: readonly (ContentDocument | null)[],
  beside: readonly string[] = [],
) => [
  ...new Set([
    ...documents.flatMap((document) =>
      document ? contentFileIds(document) : [],
    ),
    ...beside,
  ]),
];

/**
 * Writes a host's words in its first language and, when written, the other.
 * What readers already have keeps its files while edits wait, and a checked
 * translation is checked again once it is rewritten or dropped; a check
 * lapses by itself once the original's words change. Answers the original's
 * document, and the host's version when clearing the check changed it.
 */
export async function saveWords(
  context: UnitContext,
  host: Host,
  input: {
    primaryLocale: ContentLocale;
    body: ContentDocument;
    translation: ContentDocument | null;
    /** Files the host shows beside its words, such as a cover. */
    beside?: readonly string[];
    /** Where the translation's check is kept, for hosts that keep one. */
    review?: TranslatedHost;
  },
): Promise<{ originalId: string; version: number | null }> {
  const [before, published] = await Promise.all([
    draftWords(context, host),
    publishedWords(context, host),
  ]);
  const kept = published
    ? filesOf([published.body, published.translation])
    : [];
  const placed = await placeMedia(
    context,
    host,
    input.body,
    filesOf([input.body], input.beside),
  );
  const original = await saveDocument(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    host,
    kind: "rich_text",
    locale: input.primaryLocale,
    content: placed.content as unknown as Record<string, unknown>,
    plainText: contentPlainText(input.body),
    mediaIds: [...new Set([...placed.mediaIds, ...kept])],
    userId: context.actor.userId,
  });
  const translated =
    input.translation && documentWritten(input.translation)
      ? input.translation
      : null;
  if (translated) {
    const other = await placeMedia(
      context,
      host,
      translated,
      contentFileIds(translated),
    );
    await saveTranslation(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      originalId: original.id,
      locale: otherLocale(input.primaryLocale),
      kind: "rich_text",
      content: other.content as unknown as Record<string, unknown>,
      plainText: contentPlainText(translated),
      mediaIds: other.mediaIds,
      userId: context.actor.userId,
    });
  } else
    await dropTranslation(context.tx, {
      tenantId: context.tenantId,
      originalId: original.id,
    });
  const lapsed =
    !translated ||
    contentPlainText(translated) !== (before.translation?.plainText ?? null);
  return {
    originalId: original.id,
    version:
      input.review && lapsed
        ? await reviewTranslation(context.tx, {
            tenantId: context.tenantId,
            host: input.review,
            id: host.id,
            userId: context.actor.userId,
            reviewed: false,
          })
        : null,
  };
}

/** Who the files of a publication show without consent to be shown this way. */
async function unconsented(
  context: UnitContext,
  fileIds: readonly string[],
  meaning: "photo_internal" | "photo_website",
) {
  if (fileIds.length === 0) return false;
  return (
    (
      await subjectsWithoutConsent(context.tx, {
        tenantId: context.tenantId,
        fileIds,
        meaning,
        on: context.today,
      })
    ).length > 0
  );
}

/**
 * What stops a publication going out, in each document it shows: the one
 * check list, and consent from everyone its pictures show to be shown
 * inside the school. A copy on the website is checked against consent to
 * the website as its pictures go public.
 */
export async function wordsIssues(
  context: UnitContext,
  documents: readonly (ContentDocument | null)[],
  rules: PublishRules & {
    /** Files shown beside the words, such as a cover. */
    beside?: readonly string[];
    /** False where the copy readers see is the website's, checked as it goes public. */
    consent?: boolean;
  } = {},
): Promise<PublishIssue[]> {
  const found = new Set<PublishIssue>(
    documents.flatMap((document) =>
      document ? publishIssues(document, rules) : [],
    ),
  );
  if (
    rules.consent !== false &&
    (await unconsented(
      context,
      filesOf(documents, rules.beside),
      "photo_internal",
    ))
  )
    found.add("consent");
  return [...found];
}

/**
 * Snapshots a host's words, both languages, as the copy its readers see.
 * Live words tell the people they newly mention now; words set for later
 * tell them when they go live.
 */
export async function publishWords(
  context: UnitContext,
  host: Host,
  input: { live: boolean; title: string; titleAr?: string },
): Promise<void> {
  const { original, translation } = await draftWords(context, host);
  if (!original) return;
  if (input.live)
    await publishTelling(context, {
      documentId: original.id,
      subject: host,
      title: input.title,
      ...(input.titleAr ? { titleAr: input.titleAr } : {}),
    });
  else
    await snapshotPublish(context.tx, {
      tenantId: context.tenantId,
      documentId: original.id,
      userId: context.actor.userId,
    });
  if (translation)
    await snapshotPublish(context.tx, {
      tenantId: context.tenantId,
      documentId: translation.id,
      userId: context.actor.userId,
    });
}

/** Where a go-live is told: the school's unit of work and day, as its author, with its modules. */
export type LiveScope = NoticeScope &
  Pick<ModuleScope, "school" | "extensions"> & {
    today: string;
    actorUserId: string;
  };

/**
 * A kind of publication that can be set to go out later. `due` claims what
 * has gone live untold, and `live` tells its readers as publishing it then
 * would have, and records that they were told.
 */
export interface GoLive<T> {
  due: (
    tx: CellTransaction,
    input: { tenantId: string; now: Date; limit: number },
  ) => Promise<T[]>;
  schoolOf: (row: T) => string;
  authorOf: (row: T) => string;
  live: (scope: LiveScope, row: T) => Promise<void>;
}

const hosts = new Map<string, GoLive<unknown>>();

export function registerGoLive<T>(hostType: string, host: GoLive<T>) {
  hosts.set(hostType, host as GoLive<unknown>);
}

/** Tells the people words set for later newly mention, once they have gone live. */
export async function tellLive(
  scope: LiveScope,
  host: Host,
  input: { title: string; titleAr?: string },
): Promise<void> {
  const document = await documentOf(scope.tx, scope.tenantId, host);
  if (document)
    await tellPublished(scope, {
      documentId: document.id,
      subject: host,
      title: input.title,
      ...(input.titleAr ? { titleAr: input.titleAr } : {}),
    });
}

/**
 * Tells the readers of everything one tenant set to go out later whose time
 * has come, on the database's clock, with nobody acting but its author.
 * Answers how many publications went live.
 */
export async function runGoLive(
  cell: Cell,
  tenantId: string,
  input: {
    channels: UnitContext["channels"];
    modules: WorkerModules;
    limit?: number;
  },
): Promise<number> {
  return cell.withWorker(
    { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
    "write",
    async (tx, now) => {
      let told = 0;
      const zones = new Map<string, string>();
      for (const host of hosts.values()) {
        const due = await host.due(tx, {
          tenantId,
          now,
          limit: input.limit ?? 100,
        });
        for (const row of due) {
          const schoolId = host.schoolOf(row);
          const scope = await workerScope(input.modules, {
            tx,
            tenantId,
            schoolId,
          });
          // A school the directory no longer holds has nobody to tell.
          if (!scope) continue;
          const zone = zones.get(schoolId) ?? (await schoolZone(tx, schoolId));
          zones.set(schoolId, zone);
          await host.live(
            {
              ...scope,
              actorUserId: host.authorOf(row),
              now,
              channels: input.channels,
              today: schoolDate(zone, now),
            },
            row,
          );
          told += 1;
        }
      }
      return told;
    },
  );
}

/** Runs go-live over every tenant of the cell on a timer. */
export function startPublicationClock(input: {
  cell: Cell;
  directory: Directory;
  cellId: string;
  channels: UnitContext["channels"];
  extensions: WorkerModules["extensions"];
  intervalMs: number;
}): () => Promise<void> {
  return everyTenant({
    name: "publication.clock",
    directory: input.directory,
    cellId: input.cellId,
    intervalMs: input.intervalMs,
    run: async (tenantId) => {
      await runGoLive(input.cell, tenantId, {
        channels: input.channels,
        modules: { directory: input.directory, extensions: input.extensions },
      });
    },
  });
}
