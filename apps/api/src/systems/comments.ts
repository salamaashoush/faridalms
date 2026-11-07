import type { NoticeParams } from "@faridalms/domain/notifications";

import {
  documentCommentById,
  editorParentOf,
  hostOfDocument,
  insertDocumentComment,
  insertThread,
  removeDocumentComment,
  setThreadResolved,
  staffAmong,
  threadById,
  threadsOfDocument,
  updateDocumentComment,
} from "@faridalms/database/stores/comments";
import { namesOf } from "@faridalms/database/stores/coursework";
import { documentIdOf } from "@faridalms/database/stores/documents";
import { staffDirectory } from "@faridalms/database/stores/staff";
import {
  colleaguesSchema,
  commentHostSchema,
  editCommentSchema,
  removeCommentSchema,
  replySchema,
  resolveThreadSchema,
  startThreadSchema,
} from "@faridalms/domain/document-comments";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { notifyIn } from "../core/notify";
import { localeOf, readProcedure, writeProcedure } from "../core/procedure";
import { isStaff } from "../core/reach";
import { hostAccess } from "../files/authorize";

type Host = { type: string; id: string };

const conflict = () =>
  new ORPCError("CONFLICT", { message: "conflict.version" });

/**
 * Comments belong to those who may change the document: the host's own
 * writer decides, as it does for live editing and versions. Anyone else,
 * readers included, is told there is nothing here.
 */
async function requireWriter(context: UnitContext, host: Host) {
  if (!isStaff(context) || (await hostAccess(context, host)) !== "write")
    throw new ORPCError("NOT_FOUND");
}

async function documentOf(context: UnitContext, host: Host) {
  await requireWriter(context, host);
  return documentIdOf(context.tx, context.tenantId, host);
}

/** The thread and the record it is about, for a writer of that record. */
async function writableThread(context: UnitContext, threadId: string) {
  const thread = await threadById(context.tx, context.tenantId, threadId);
  const host = thread
    ? await hostOfDocument(context.tx, context.tenantId, thread.documentId)
    : null;
  if (!thread || !host) throw new ORPCError("NOT_FOUND");
  await requireWriter(context, host);
  return { thread, host };
}

/** A comment of the viewer's own, in a record they still write. */
async function ownComment(context: UnitContext, commentId: string) {
  const comment = await documentCommentById(
    context.tx,
    context.tenantId,
    commentId,
  );
  const host = comment
    ? await hostOfDocument(context.tx, context.tenantId, comment.documentId)
    : null;
  if (!comment || !host) throw new ORPCError("NOT_FOUND");
  await requireWriter(context, host);
  if (comment.authorId !== context.actor.userId)
    throw new ORPCError("FORBIDDEN", { message: "comments.author" });
  return { comment, host };
}

/** The colleagues among those picked; anyone else is not told. */
function colleaguesAmong(context: UnitContext, picked: readonly string[]) {
  return staffAmong(
    context.tx,
    {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      today: context.today,
    },
    picked.filter((id) => id !== context.actor.userId),
  );
}

/**
 * Tells colleagues a comment mentions them, linked to the thread in the
 * record's editor. Whether they can open it is still the record's own
 * writer's to decide.
 */
async function tellMentioned(
  context: UnitContext,
  input: {
    host: Host;
    threadId: string;
    quote: string;
    body: string;
    people: readonly string[];
  },
) {
  if (input.people.length === 0) return;
  const [[author], parentId] = await Promise.all([
    namesOf(context.tx, context.tenantId, [context.actor.userId]),
    editorParentOf(context.tx, context.tenantId, input.host),
  ]);
  const params: NoticeParams = {
    comment: true,
    threadId: input.threadId,
    preview: input.body.slice(0, 140),
    actorName: author?.fullNameEn ?? author?.fullNameAr ?? "",
    actorNameAr: author?.fullNameAr ?? author?.fullNameEn ?? "",
    ...(input.quote ? { title: input.quote } : {}),
    ...(parentId ? { parentId } : {}),
  };
  await notifyIn(
    {
      tx: context.tx,
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      actorUserId: context.actor.userId,
      now: context.now,
      channels: context.channels,
    },
    input.people,
    { kind: "mention", subject: input.host, params },
  );
}

/** A record's threads with their comments, for those who may change it. */
export const threads = readProcedure
  .input(commentHostSchema)
  .handler(async ({ input, context }) => {
    const document = await documentOf(context, {
      type: input.hostType,
      id: input.hostId,
    });
    if (!document) return [];
    return threadsOfDocument(context.tx, {
      tenantId: context.tenantId,
      documentId: document.id,
      viewerId: context.actor.userId,
    });
  });

/** Starts a thread on a passage or a block with its first comment. */
export const start = writeProcedure
  .input(startThreadSchema)
  .handler(async ({ input, context }) => {
    const host = { type: input.hostType, id: input.hostId };
    const document = await documentOf(context, host);
    if (!document) throw new ORPCError("NOT_FOUND");
    const people = await colleaguesAmong(context, input.mentions);
    const thread = await insertThread(context.tx, {
      tenantId: context.tenantId,
      documentId: document.id,
      part: input.part,
      anchor: input.anchor,
      quote: input.quote,
      userId: context.actor.userId,
    });
    await insertDocumentComment(context.tx, {
      tenantId: context.tenantId,
      threadId: thread.id,
      userId: context.actor.userId,
      body: input.body,
      mentionedUserIds: people,
    });
    await tellMentioned(context, {
      host,
      threadId: thread.id,
      quote: input.quote,
      body: input.body,
      people,
    });
    return { id: thread.id };
  });

export const reply = writeProcedure
  .input(replySchema)
  .handler(async ({ input, context }) => {
    const { thread, host } = await writableThread(context, input.threadId);
    const people = await colleaguesAmong(context, input.mentions);
    const saved = await insertDocumentComment(context.tx, {
      tenantId: context.tenantId,
      threadId: thread.id,
      userId: context.actor.userId,
      body: input.body,
      mentionedUserIds: people,
    });
    await tellMentioned(context, {
      host,
      threadId: thread.id,
      quote: thread.quote,
      body: input.body,
      people,
    });
    return saved;
  });

/** Changes the viewer's own comment; someone it newly names is told. */
export const edit = writeProcedure
  .input(editCommentSchema)
  .handler(async ({ input, context }) => {
    const { comment, host } = await ownComment(context, input.commentId);
    const people = await colleaguesAmong(context, input.mentions);
    const saved = await updateDocumentComment(context.tx, {
      tenantId: context.tenantId,
      id: comment.id,
      expectedVersion: input.expectedVersion,
      body: input.body,
      mentionedUserIds: people,
    });
    if (!saved) throw conflict();
    const told = new Set(comment.mentionedUserIds);
    await tellMentioned(context, {
      host,
      threadId: comment.threadId,
      quote: comment.quote,
      body: input.body,
      people: people.filter((id) => !told.has(id)),
    });
    return saved;
  });

/** Deletes the viewer's own comment, and the thread once it is empty. */
export const remove = writeProcedure
  .input(removeCommentSchema)
  .handler(async ({ input, context }) => {
    const { comment } = await ownComment(context, input.commentId);
    if (
      !(await removeDocumentComment(context.tx, {
        tenantId: context.tenantId,
        id: comment.id,
        expectedVersion: input.expectedVersion,
      }))
    )
      throw conflict();
    return { ok: true as const };
  });

/** Resolves a thread, or reopens it; anyone who writes the record may. */
export const resolve = writeProcedure
  .input(resolveThreadSchema)
  .handler(async ({ input, context }) => {
    const { thread } = await writableThread(context, input.threadId);
    const saved = await setThreadResolved(context.tx, {
      tenantId: context.tenantId,
      id: thread.id,
      expectedVersion: input.expectedVersion,
      userId: input.resolved ? context.actor.userId : null,
    });
    if (!saved) throw conflict();
    return saved;
  });

/** Colleagues a writer may mention, found by name. */
export const colleagues = readProcedure
  .input(colleaguesSchema)
  .handler(async ({ input, context }) => {
    await requireWriter(context, { type: input.hostType, id: input.hostId });
    const locale = localeOf(context);
    const found = await staffDirectory(
      context.tx,
      {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        today: context.today,
      },
      {
        q: input.q,
        phone: null,
        roles: [],
        sort: "name",
        dir: "asc",
        page: 1,
        pageSize: 8,
        locale,
      },
    );
    return found.rows
      .filter((row) => row.id !== context.actor.userId)
      .map((row) => {
        const en = row.fullNameEn ?? row.fullNameAr ?? "";
        const ar = row.fullNameAr ?? row.fullNameEn ?? "";
        const title = locale === "ar" ? row.titleAr : row.titleEn;
        return {
          id: row.id,
          label: locale === "ar" ? ar : en,
          detail: title ?? "",
        };
      });
  });
