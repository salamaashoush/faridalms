import type { ContentDocument } from "@faridalms/domain/content";

import { reachedAmong } from "@faridalms/database/stores/audiences";
import { namesOf } from "@faridalms/database/stores/coursework";
import {
  publishedVersion,
  snapshotPublish,
} from "@faridalms/database/stores/documents";
import { contentMentions } from "@faridalms/domain/content";

import type { UnitContext } from "./context";

import { notify } from "./notify";

const peopleIn = (content: Record<string, unknown> | undefined) =>
  content
    ? contentMentions(content as unknown as ContentDocument)
        .filter((mention) => mention.kind === "person")
        .map((mention) => mention.id)
    : [];

/**
 * Snapshots a document as its readers now see it, and tells each person
 * at the school it mentions for the first time. A mention reaches its
 * person when the words go out, as a published page's do, not while they
 * are still being written; one already told is not told again.
 */
export async function publishTelling(
  context: UnitContext,
  input: {
    documentId: string;
    subject: { type: string; id: string };
    title: string;
    titleAr?: string;
  },
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
  const told = new Set(peopleIn(before?.content));
  const fresh = peopleIn(after.content).filter((id) => !told.has(id));
  const people = await reachedAmong(
    context.tx,
    {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      on: context.today,
    },
    fresh,
  );
  if (people.length === 0) return;
  const [author] = await namesOf(context.tx, context.tenantId, [
    context.actor.userId,
  ]);
  await notify(context, people, {
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
