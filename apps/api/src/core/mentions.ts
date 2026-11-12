import type { PublishedVersion } from "@faridalms/database/stores/documents";
import type { ContentDocument } from "@faridalms/domain/content";

import { reachedAmong } from "@faridalms/database/stores/audiences";
import {
  publishedVersion,
  publishedVersions,
  snapshotPublish,
} from "@faridalms/database/stores/documents";
import { namesOf } from "@faridalms/database/stores/persons";
import { contentMentions } from "@faridalms/domain/content";

import type { UnitContext } from "./context";
import type { ModuleScope } from "./extension";
import type { NoticeScope } from "./notify";

import { learnersActedFor } from "../people/acting";
import { notifyIn } from "./notify";

/** Where a mention is told: the school's unit of work and day, as the author, with its modules. */
type TellingScope = NoticeScope &
  Pick<ModuleScope, "school" | "extensions"> & {
    today: string;
    actorUserId: string;
  };

/** Of these people, those the school reaches: its staff and students, and whoever acts for a learner. */
async function reachedOf(scope: TellingScope, ids: readonly string[]) {
  const core = await reachedAmong(
    scope.tx,
    { tenantId: scope.tenantId, schoolId: scope.schoolId, on: scope.today },
    ids,
  );
  const acting = await Promise.all(
    ids
      .filter((id) => !core.includes(id))
      .map(async (id) =>
        (
          await learnersActedFor(scope, {
            userId: id,
            on: scope.today,
            purpose: "contact",
          })
        ).length > 0
          ? [id]
          : [],
      ),
  );
  return [...core, ...acting.flat()];
}

const peopleIn = (content: Record<string, unknown> | undefined) =>
  content
    ? contentMentions(content as unknown as ContentDocument)
        .filter((mention) => mention.kind === "person")
        .map((mention) => mention.id)
    : [];

interface Telling {
  documentId: string;
  subject: { type: string; id: string };
  title: string;
  titleAr?: string;
}

/** Tells the people `after` mentions that `before` did not, as its author. */
async function tellFresh(
  scope: TellingScope,
  before: PublishedVersion | null,
  after: PublishedVersion,
  input: Telling,
): Promise<void> {
  const told = new Set(peopleIn(before?.content));
  const fresh = peopleIn(after.content).filter((id) => !told.has(id));
  const people = await reachedOf(scope, fresh);
  if (people.length === 0) return;
  const [author] = await namesOf(scope.tx, scope.tenantId, [scope.actorUserId]);
  await notifyIn(scope, people, {
    kind: "mention",
    subject: input.subject,
    params: {
      title: input.title,
      ...(input.titleAr ? { titleAr: input.titleAr } : {}),
      actorName: author?.fullNameEn ?? author?.fullNameAr ?? "",
      actorNameAr: author?.fullNameAr ?? author?.fullNameEn ?? "",
    },
  });
}

/**
 * Snapshots a document as its readers now see it, and tells each person
 * at the school it mentions for the first time. A mention reaches its
 * person when the words go out, as a published page's do, not while they
 * are still being written; one already told is not told again.
 */
export async function publishTelling(
  context: UnitContext,
  input: Telling,
): Promise<void> {
  const before = await publishedVersion(
    context.tx,
    context.tenantId,
    input.documentId,
  );
  await snapshotPublish(context.tx, {
    tenantId: context.tenantId,
    documentId: input.documentId,
    userId: context.actor.userId,
  });
  const after = await publishedVersion(
    context.tx,
    context.tenantId,
    input.documentId,
  );
  if (!after || after.id === before?.id) return;
  await tellFresh(
    {
      tx: context.tx,
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      school: context.school,
      extensions: context.extensions,
      actorUserId: context.actor.userId,
      now: context.now,
      channels: context.channels,
      today: context.today,
    },
    before,
    after,
    input,
  );
}

/**
 * Tells the people a snapshot taken earlier mentions for the first time,
 * once the words it holds reach their readers: a publication set for later
 * is snapshotted when it is scheduled and heard of when it goes live.
 */
export async function tellPublished(
  scope: TellingScope,
  input: Telling,
): Promise<void> {
  const [after, before = null] = await publishedVersions(
    scope.tx,
    scope.tenantId,
    input.documentId,
    2,
  );
  if (after) await tellFresh(scope, before, after, input);
}
