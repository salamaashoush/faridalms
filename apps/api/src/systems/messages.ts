import type { Reach } from "@faridalms/database/stores/messages";

import { namesOf } from "@faridalms/database/stores/coursework";
import { filesOfHosts, linkFiles } from "@faridalms/database/stores/files";
import {
  addMembers,
  createThread,
  existingThread,
  markRead as markThreadRead,
  membersOf,
  messageable,
  messagesOf,
  messagingGuardians,
  postMessage,
  readsMessage,
  removeMembers,
  saveDraft as writeDraft,
  threadById,
  threadsOf,
  unreachable,
  unreadThreads,
} from "@faridalms/database/stores/messages";
import { isVisibleStudent } from "@faridalms/database/stores/students";
import {
  draftSchema,
  inboxQuerySchema,
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
import { registerHostReader } from "../files/authorize";

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

/** A thread of this school the viewer is in, or not found. */
async function memberThread(context: UnitContext, threadId: string) {
  const thread = await threadById(context.tx, context.tenantId, threadId);
  if (!thread || thread.orgId !== context.schoolId)
    throw new ORPCError("NOT_FOUND");
  const members = await membersOf(context.tx, context.tenantId, thread.id);
  const me = members.find((row) => row.userId === context.actor.userId);
  if (!me) throw new ORPCError("NOT_FOUND");
  return { thread, members, me };
}

async function attach(
  context: UnitContext,
  messageId: string,
  fileIds: readonly string[],
) {
  if (fileIds.length === 0) return;
  const linked = await linkFiles(context.tx, {
    tenantId: context.tenantId,
    userId: context.actor.userId,
    ids: fileIds,
    purpose: "attachment",
    host: { type: "message", id: messageId },
  });
  if (linked.length !== fileIds.length)
    throw new ORPCError("CONFLICT", { message: "files.not_linkable" });
}

registerHostReader("message", (context, hostId) =>
  readsMessage(context.tx, {
    tenantId: context.tenantId,
    messageId: hostId,
    userId: context.actor.userId,
  }),
);

export const inbox = readProcedure
  .input(inboxQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "messages:read");
    const rows = await threadsOf(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      unreadOnly: input.show === "unread",
      q: input.q,
      limit: 200,
    });
    return {
      rows,
      canStart: can(context, "messages:send"),
      canStartFamily: can(context, "messages:send") && isStaff(context),
    };
  });

export const unread = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "messages:read");
  return {
    threads: await unreadThreads(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
    }),
  };
});

export const thread = readProcedure
  .input(threadQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "messages:read");
    const { thread: row, members, me } = await memberThread(context, input.id);
    const rows = await messagesOf(context.tx, {
      tenantId: context.tenantId,
      threadId: row.id,
      before: input.before || null,
      limit: 100,
    });
    const files = await filesOfHosts(context.tx, context.tenantId, {
      type: "message",
      ids: rows.map((message) => message.id),
    });
    const staff = isStaff(context);
    const [student] = row.studentId
      ? await namesOf(context.tx, context.tenantId, [row.studentId])
      : [];
    return {
      id: row.id,
      kind: row.kind,
      subject: row.subject,
      student: row.studentId
        ? {
            id: row.studentId,
            fullNameEn: student?.fullNameEn ?? null,
            fullNameAr: student?.fullNameAr ?? null,
          }
        : null,
      members: members.map((member) => ({
        userId: member.userId,
        fullNameEn: member.fullNameEn,
        fullNameAr: member.fullNameAr,
        role: member.role,
        lastReadAt: staff ? member.lastReadAt : null,
      })),
      draft: me.draft,
      canManage: row.kind === "group" && me.role === "owner",
      showsSeen: staff,
      messages: rows.map((message) => ({
        ...message,
        files: files
          .filter((file) => file.hostId === message.id)
          .map((file) => ({
            id: file.id,
            name: file.name,
            mediaType: file.mediaType,
            sizeBytes: file.sizeBytes,
          })),
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

export const send = writeProcedure
  .input(sendSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "messages:send");
    const { thread: row } = await memberThread(context, input.threadId);
    const posted = await postMessage(context.tx, {
      tenantId: context.tenantId,
      threadId: row.id,
      authorId: context.actor.userId,
      body: input.body,
    });
    await attach(context, posted.id, input.fileIds);
    return posted;
  });

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
          ownerId: me,
          memberIds: input.recipientIds,
        });
        created = true;
      }
    }
    const posted = await postMessage(context.tx, {
      tenantId: context.tenantId,
      threadId,
      authorId: me,
      body: input.body,
    });
    await attach(context, posted.id, input.fileIds);
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
    requireCapability(context, "messages:read");
    const { thread: row } = await memberThread(context, input.threadId);
    await markThreadRead(context.tx, {
      tenantId: context.tenantId,
      threadId: row.id,
      userId: context.actor.userId,
    });
    return { read: true };
  });

export const saveDraft = writeProcedure
  .input(draftSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "messages:send");
    const { thread: row } = await memberThread(context, input.threadId);
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
    const { thread: row, me } = await memberThread(context, input.threadId);
    if (row.kind !== "group" || me.role !== "owner")
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
