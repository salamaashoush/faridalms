import type { Reach } from "@faridalms/database/stores/messages";
import type { ContentDocument } from "@faridalms/domain/content";
import type { EntryDetails, Mailbox } from "@faridalms/domain/messages";

import { namesOf } from "@faridalms/database/stores/coursework";
import {
  addMembers,
  createThread,
  existingThread,
  markRead as markThreadRead,
  membersOf,
  messageable,
  messagesOf,
  messagingGuardians,
  readsMessage,
  removeMembers,
  saveDraft as writeDraft,
  threadById,
  threadsOf,
  unreachable,
  unreadThreads,
  writtenSince,
} from "@faridalms/database/stores/messages";
import { readSubject } from "@faridalms/database/stores/notifications";
import { isVisibleStudent } from "@faridalms/database/stores/students";
import { contentFileIds } from "@faridalms/domain/content";
import {
  draftSchema,
  inboxQuerySchema,
  isInternal,
  mailboxesOf,
  membersSchema,
  recipientsQuerySchema,
  sendSchema,
  startSchema,
  threadQuerySchema,
} from "@faridalms/domain/messages";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { placeMedia, registerHostReader } from "../files/authorize";
import { scopeOf, writeEntry } from "../messages/conversations";

const id = v.pipe(v.string(), v.uuid());

function reachOf(context: UnitContext): Reach {
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    viewerId: context.actor.userId,
    on: context.today,
    schoolWide: can(context, "classes:manage") || can(context, "people:manage"),
  };
}

/** Staff read who has seen their messages; families and students never see staff read state. */
function isStaff(context: UnitContext) {
  return can(context, "people:read");
}

/** The mailboxes the viewer's capabilities read and write in. */
const mailboxesFor = (context: UnitContext) =>
  mailboxesOf(context.actor.capabilities);

/**
 * A conversation of this school the viewer reaches, or not found: one
 * they are in, or one in a mailbox their team shares, which they read
 * whole, internal entries included. In a mailbox conversation only a
 * contact's row, theirs once linked, makes someone a member; a staff
 * member's row there keeps read state and lets them in to nothing.
 */
async function openThread(context: UnitContext, threadId: string) {
  const thread = await threadById(context.tx, context.tenantId, threadId);
  if (!thread || thread.orgId !== context.schoolId)
    throw new ORPCError("NOT_FOUND");
  const members = await membersOf(context.tx, context.tenantId, thread.id);
  const boxes = mailboxesFor(context);
  const team = thread.mailbox !== null && boxes.reads.includes(thread.mailbox);
  const me =
    members.find(
      (row) =>
        row.userId === context.actor.userId &&
        (thread.mailbox === null || row.role === "member"),
    ) ?? null;
  if (!team && !me) throw new ORPCError("NOT_FOUND");
  const draft =
    members.find(
      (row) => row.userId === context.actor.userId && row.role !== "member",
    )?.draft ??
    me?.draft ??
    null;
  return {
    thread,
    members,
    me,
    team,
    /** Whether the viewer writes here: their team's writer, or a member who may send. */
    writes: team
      ? boxes.writes.includes(thread.mailbox as Mailbox)
      : can(context, "messages:send"),
    draft,
  };
}

registerHostReader("message", (context, hostId) =>
  readsMessage(context.tx, {
    tenantId: context.tenantId,
    messageId: hostId,
    userId: context.actor.userId,
    mailboxes: mailboxesFor(context).reads,
  }),
);

/** Reading Messages needs its capability, or a mailbox to read. */
function readsMessages(context: UnitContext) {
  if (mailboxesFor(context).reads.length) return;
  requireCapability(context, "messages:read");
}

export const inbox = readProcedure
  .input(inboxQuerySchema)
  .handler(async ({ input, context }) => {
    readsMessages(context);
    const boxes = mailboxesFor(context);
    const box =
      input.box === "all" ||
      input.box === "personal" ||
      boxes.reads.includes(input.box)
        ? input.box
        : "personal";
    const rows = await threadsOf(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      mailboxes: boxes.reads,
      box,
      unreadOnly: input.show === "unread",
      q: input.q,
      limit: 200,
    });
    return {
      rows,
      mailboxes: boxes.reads,
      canStart: can(context, "messages:send"),
      canStartFamily: can(context, "messages:send") && isStaff(context),
    };
  });

export const unread = readProcedure.handler(async ({ context }) => {
  readsMessages(context);
  return {
    threads: await unreadThreads(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      mailboxes: mailboxesFor(context).reads,
    }),
  };
});

export const thread = readProcedure
  .input(threadQuerySchema)
  .handler(async ({ input, context }) => {
    const opened = await openThread(context, input.id);
    const { thread: row, members, team } = opened;
    const rows = await messagesOf(context.tx, {
      tenantId: context.tenantId,
      threadId: row.id,
      before: input.before || null,
      limit: 100,
      internal: team,
    });
    const staff = isStaff(context);
    const [student] = row.studentId
      ? await namesOf(context.tx, context.tenantId, [row.studentId])
      : [];
    // A mailbox conversation shows its outside contacts and who holds it;
    // the team's own read rows are nobody's business.
    const shown = members.filter(
      (member) => row.mailbox === null || member.role !== "reader",
    );
    return {
      id: row.id,
      kind: row.kind,
      mailbox: row.mailbox,
      subject: row.subject,
      student: row.studentId
        ? {
            id: row.studentId,
            fullNameEn: student?.fullNameEn ?? null,
            fullNameAr: student?.fullNameAr ?? null,
          }
        : null,
      members: shown.map((member) => ({
        userId: member.userId,
        contactId: member.contactId,
        fullNameEn: member.fullNameEn,
        fullNameAr: member.fullNameAr,
        role: member.role,
        outside: member.contactId !== null,
        email: team ? member.email : null,
        lastReadAt: staff ? member.lastReadAt : null,
      })),
      owner:
        row.mailbox !== null
          ? (() => {
              const owner = members.find(
                (member) => member.role === "owner" && !member.contactId,
              );
              return owner
                ? {
                    userId: owner.userId,
                    fullNameEn: owner.fullNameEn,
                    fullNameAr: owner.fullNameAr,
                  }
                : null;
            })()
          : null,
      draft: opened.draft,
      team,
      canWrite: opened.writes,
      canNote: team && opened.writes,
      /** Whether a message here also reaches someone by email. */
      emailsOutside: members.some(
        (member) =>
          member.contactId !== null &&
          member.email !== null &&
          member.userId === null,
      ),
      canManage: row.kind === "group" && opened.me?.role === "owner",
      showsSeen: staff,
      latestId: rows.at(-1)?.id ?? null,
      messages: rows.map((message) => ({
        id: message.id,
        kind: message.kind,
        authorId: message.authorId,
        authorContactId: message.authorContactId,
        authorNameEn: message.authorNameEn,
        authorNameAr: message.authorNameAr,
        body: message.body,
        content: message.content as unknown as ContentDocument | null,
        details: (team || message.kind === "message"
          ? message.details
          : {}) as EntryDetails,
        redacted: message.redacted,
        createdAt: message.createdAt,
      })),
      hasMore: rows.length === 100,
    };
  });

export const recipients = readProcedure
  .input(recipientsQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "messages:send");
    return {
      rows: await messageable(context.tx, reachOf(context), {
        q: input.q,
        limit: 30,
      }),
    };
  });

/**
 * A message, or in a mailbox conversation an internal note or a contact
 * logged. One action whether written in Messages or on the record the
 * conversation belongs to, such as an enquiry. A reply that someone else
 * has overtaken since the writer last looked is refused until they have
 * read it, unless they send it anyway.
 */
export const send = writeProcedure
  .input(sendSchema)
  .handler(async ({ input, context }) => {
    const {
      thread: row,
      team,
      writes,
    } = await openThread(context, input.threadId);
    if (!writes) throw new ORPCError("FORBIDDEN");
    if (isInternal(input.kind) && !team) throw new ORPCError("FORBIDDEN");
    if (team && input.kind === "message" && !input.force) {
      const newer = await writtenSince(context.tx, {
        tenantId: context.tenantId,
        threadId: row.id,
        afterId: input.after || null,
        viewerId: context.actor.userId,
      });
      if (newer)
        throw new ORPCError("CONFLICT", {
          message: "messages.newer",
          data: { latestId: newer.id },
        });
    }
    return writeComposed(context, {
      threadId: row.id,
      kind: input.kind,
      content: input.content,
    });
  });

/**
 * Writes what someone composed. The entry's id is made first, so the files
 * its document shows are placed in its keeping before the document is
 * saved, and its readers are the ones who may open them.
 */
async function writeComposed(
  context: UnitContext,
  input: {
    threadId: string;
    kind: v.InferOutput<typeof sendSchema>["kind"];
    content: ContentDocument;
    details?: Record<string, unknown>;
  },
) {
  const entryId = Bun.randomUUIDv7();
  const placed = await placeMedia(
    context,
    { type: "message", id: entryId },
    input.content,
    contentFileIds(input.content),
  );
  return writeEntry(scopeOf(context), {
    id: entryId,
    threadId: input.threadId,
    kind: input.kind,
    authorUserId: context.actor.userId,
    content: placed.content,
    mediaIds: placed.mediaIds,
    details: input.details ?? {},
  });
}

/** Writes to someone new: continues an open conversation with them, or starts one. */
export const start = writeProcedure
  .input(startSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "messages:send");
    const me = context.actor.userId;
    let threadId: string | null = null;
    let created = false;
    if (input.kind === "family") {
      if (!isStaff(context)) throw new ORPCError("FORBIDDEN");
      if (
        !(await isVisibleStudent(
          context.tx,
          {
            tenantId: context.tenantId,
            schoolId: context.schoolId,
            today: context.today,
            viewerId: me,
            schoolWide: reachOf(context).schoolWide,
          },
          input.studentId,
        ))
      )
        throw new ORPCError("NOT_FOUND");
      const guardians = await messagingGuardians(context.tx, {
        tenantId: context.tenantId,
        studentId: input.studentId,
        on: context.today,
      });
      if (guardians.length === 0)
        throw new ORPCError("CONFLICT", { message: "messages.no_guardians" });
      threadId = await existingThread(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        kind: "family",
        memberIds: [],
        studentId: input.studentId,
        ownerId: me,
      });
      if (threadId) {
        await addMembers(context.tx, {
          tenantId: context.tenantId,
          threadId,
          userIds: guardians,
          role: "member",
        });
      } else {
        threadId = await createThread(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          kind: "family",
          subject: null,
          studentId: input.studentId,
          createdBy: me,
          ownerId: me,
          memberIds: guardians,
        });
        created = true;
      }
    } else {
      if (input.kind === "group" && !isStaff(context))
        throw new ORPCError("FORBIDDEN");
      const outside = await unreachable(
        context.tx,
        reachOf(context),
        input.recipientIds,
      );
      if (outside.length)
        throw new ORPCError("FORBIDDEN", { message: "messages.recipient" });
      if (input.kind === "direct")
        threadId = await existingThread(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          kind: "direct",
          memberIds: [me, ...input.recipientIds],
          studentId: null,
          ownerId: me,
        });
      if (!threadId) {
        threadId = await createThread(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          kind: input.kind,
          subject: input.kind === "group" ? input.subject : null,
          studentId: null,
          createdBy: me,
          ownerId: me,
          memberIds: input.recipientIds,
        });
        created = true;
      }
    }
    await writeComposed(context, {
      threadId,
      kind: "message",
      content: input.content,
    });
    if (created)
      await audit(context, {
        action: "message_thread.create",
        objectType: "message_thread",
        objectId: threadId,
        studentUserId: input.studentId || null,
        details: { kind: input.kind, members: input.recipientIds.length },
      });
    return { threadId, created };
  });

export const markRead = writeProcedure
  .input(v.object({ threadId: id }))
  .handler(async ({ input, context }) => {
    const { thread: row } = await openThread(context, input.threadId);
    await markThreadRead(context.tx, {
      tenantId: context.tenantId,
      threadId: row.id,
      userId: context.actor.userId,
    });
    await readSubject(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      subjectType: "message_thread",
      subjectId: row.id,
    });
    return { read: true };
  });

export const saveDraft = writeProcedure
  .input(draftSchema)
  .handler(async ({ input, context }) => {
    const { thread: row, writes } = await openThread(context, input.threadId);
    if (!writes) throw new ORPCError("FORBIDDEN");
    await writeDraft(context.tx, {
      tenantId: context.tenantId,
      threadId: row.id,
      userId: context.actor.userId,
      draft: input.draft,
    });
    return { saved: true };
  });

/** A group's owner brings people in or takes them out. */
export const members = writeProcedure
  .input(membersSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "messages:send");
    const { thread: row, me } = await openThread(context, input.threadId);
    if (row.kind !== "group" || me?.role !== "owner")
      throw new ORPCError("FORBIDDEN");
    const outside = await unreachable(context.tx, reachOf(context), input.add);
    if (outside.length)
      throw new ORPCError("FORBIDDEN", { message: "messages.recipient" });
    await addMembers(context.tx, {
      tenantId: context.tenantId,
      threadId: row.id,
      userIds: input.add,
      role: "member",
    });
    const removed = await removeMembers(context.tx, {
      tenantId: context.tenantId,
      threadId: row.id,
      userIds: input.remove.filter((userId) => userId !== context.actor.userId),
    });
    await audit(context, {
      action: "message_thread.members",
      objectType: "message_thread",
      objectId: row.id,
      details: { added: input.add, removed },
    });
    return { added: input.add.length, removed };
  });
