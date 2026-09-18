import type {
  MESSAGE_CATEGORIES,
  RecipientCursor,
} from "@faridalms/domain/school-schema";

import { currentSchoolYear } from "@faridalms/database/repositories/academics";
import {
  saveCalendarEvent as saveCalendarEventRow,
  availableRecipients,
  eventsInRange,
  getMessageThread,
  listEvents,
  listMessages,
  listNewsletters,
  markThreadRead,
  sendMessage as sendMessageRow,
  unreadCount,
} from "@faridalms/database/repositories/communication";
import { ManagementError } from "@faridalms/database/repositories/management";
import {
  getMessageDraft as findDraft,
  listMessageDrafts,
  saveMessageDraft as saveDraft,
  sendMessageDraft as sendDraft,
} from "@faridalms/database/repositories/message-drafts";
import {
  messageDraftQuerySchema,
  saveMessageDraftSchema,
  sendMessageDraftSchema,
} from "@faridalms/domain/message-draft";
import {
  recipientQuerySchema,
  replyMessageSchema,
  calendarEventSchema,
  calendarQuerySchema,
  composeMessageSchema,
  messagesQuerySchema,
  newslettersQuerySchema,
} from "@faridalms/domain/school-schema";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { SchoolContext } from "../context";

import {
  requirePermission,
  requireStudentAccess,
  visibleStudentIds,
} from "../authorization";
import { protectedProcedure } from "../procedure";

export const getMessages = protectedProcedure
  .input(messagesQuerySchema)
  .handler(async ({ input: data, context }) => {
    const user = await requirePermission(context, "messages:read");
    const [directory, unread] = await Promise.all([
      listMessages(context.db, user.id, data.folder, data.q, data.page),
      unreadCount(context.db, user.id),
    ]);
    return { folder: data.folder, ...directory, unread };
  });

export const getMessage = protectedProcedure
  .input(v.object({ id: v.string() }))
  .handler(async ({ input: data, context }) => {
    const user = await requirePermission(context, "messages:read");
    const thread = await getMessageThread(context.db, data.id, user.id);
    if (!thread) {
      throw new ORPCError("NOT_FOUND");
    }
    // Opening the conversation is what marks it read, and only for this reader.
    await markThreadRead(context.db, thread.id, user.id);
    return thread;
  });

export const getRecipients = protectedProcedure
  .input(recipientQuerySchema)
  .handler(async ({ input: data, context }) => {
    await requirePermission(context, "messages:send");
    const found = await recipientsFor(
      context,
      data.category,
      data.q,
      undefined,
      data.cursor,
    );
    const rows = found.slice(0, 50);
    const last = rows.at(-1);
    return {
      rows,
      nextCursor:
        found.length > 50 && last ? { name: last.name, id: last.id } : null,
    };
  });

export const sendMessage = protectedProcedure
  .input(composeMessageSchema)
  .handler(async ({ input: data, context }) => {
    const user = await requirePermission(context, "messages:send");

    // A sender may only attach a child they are allowed to see.
    let studentId: string | null = null;
    if (data.studentId) {
      const access = await requireStudentAccess(context, data.studentId);
      studentId = access.studentId;
    }

    const recipients = await recipientsFor(
      context,
      data.category,
      "",
      data.recipientId,
    );
    if (!recipients.some((recipient) => recipient.id === data.recipientId))
      throw new ORPCError("FORBIDDEN");
    const id = await manage(() =>
      sendMessageRow(context.db, {
        senderId: user.id,
        category: data.category,
        studentId,
        subject: data.subject,
        body: data.body,
        bodyFormat: data.bodyFormat,
        document: data.document,
        fileIds: data.fileIds,
        recipientIds: [data.recipientId],
      }),
    );
    return { id };
  });

async function manage<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ManagementError)
      throw new ORPCError(error.code, { message: error.message });
    throw error;
  }
}

export const getNewsletters = protectedProcedure
  .input(newslettersQuerySchema)
  .handler(async ({ input: data, context }) => {
    await requirePermission(context, "newsletters:read");
    return {
      ...(await listNewsletters(context.db, data)),
      today: context.today,
    };
  });

export const getCalendar = protectedProcedure
  .input(calendarQuerySchema)
  .handler(async ({ input: data, context }) => {
    await requirePermission(context, "calendar:read");
    const year = await currentSchoolYear(context.db);
    const month = data.month || context.today.slice(0, 7);
    const [yearPart = "2026", monthPart = "09"] = month.split("-");
    const lastDay = new Date(
      Date.UTC(Number(yearPart), Number(monthPart), 0),
    ).getUTCDate();

    const [monthRange, allEvents] = await Promise.all([
      eventsInRange(
        context.db,
        year.id,
        `${month}-01`,
        `${month}-${String(lastDay).padStart(2, "0")}`,
      ),
      listEvents(context.db, year.id, data.categories),
    ]);

    // The grid honours the same category filter as the agenda. Returning the
    // whole month made the client re-filter what the server already knew.
    const monthEvents =
      data.categories.length === 0
        ? monthRange
        : monthRange.filter((event) =>
            data.categories.includes(event.category),
          );

    return { month, today: context.today, monthEvents, allEvents };
  });

export const saveCalendarEvent = protectedProcedure
  .input(calendarEventSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "calendar:manage");
    const year = await currentSchoolYear(context.db);
    const saved = await saveCalendarEventRow(context.db, year.id, input);
    if (!saved)
      throw new ORPCError("CONFLICT", {
        message: "This event has changed. Reload before saving again.",
      });
    return saved;
  });

async function recipientsFor(
  context: SchoolContext,
  category: (typeof MESSAGE_CATEGORIES)[number],
  query = "",
  recipientId?: string,
  cursor?: RecipientCursor,
) {
  let ids: string[] | undefined;
  if (category === "parents" || category === "students") {
    if (context.user.role !== "admin" && context.user.role !== "teacher")
      throw new ORPCError("FORBIDDEN");
    if (context.user.role === "teacher") {
      const students = await visibleStudentIds(context, context.user);
      if (category === "parents")
        ids = (
          await context.db.query.guardianships.findMany({
            where: { studentId: { in: students } },
            columns: { guardianId: true },
          })
        ).map((row) => row.guardianId);
      else
        ids = (
          await context.db.query.students.findMany({
            where: { id: { in: students } },
            columns: { userId: true },
          })
        ).flatMap((row) => (row.userId ? [row.userId] : []));
    }
  }
  return availableRecipients(context.db, category, {
    ids,
    query,
    recipientId,
    cursor,
  });
}
export const replyMessage = protectedProcedure
  .input(replyMessageSchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "messages:send");
    const message = await getMessageThread(
      context.db,
      input.id,
      context.user.id,
    );
    if (!message) throw new ORPCError("NOT_FOUND");
    // Everyone in the conversation except the writer hears the reply.
    const recipientIds = message.participants
      .map((person) => person.id)
      .filter((id) => id !== context.user.id);
    if (!recipientIds.length) throw new ORPCError("BAD_REQUEST");
    const id = await manage(() =>
      sendMessageRow(context.db, {
        senderId: context.user.id,
        category: message.category,
        studentId: message.studentId,
        subject: message.subject,
        body: input.body,
        bodyFormat: input.bodyFormat,
        document: input.document,
        fileIds: input.fileIds,
        recipientIds,
        parentMessageId: message.id,
      }),
    );
    return { id };
  });

export const getMessageDrafts = protectedProcedure
  .input(
    v.object({
      page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    }),
  )
  .handler(async ({ context, input }) => {
    await requirePermission(context, "messages:send");
    return listMessageDrafts(context.db, context.user.id, input.page);
  });

export const getMessageDraft = protectedProcedure
  .input(messageDraftQuerySchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "messages:send");
    const draft = await findDraft(context.db, context.user.id, input.id);
    if (!draft) throw new ORPCError("NOT_FOUND");
    const recipient = draft.recipientId
      ? await context.db.query.users.findFirst({
          where: { id: draft.recipientId },
          columns: { id: true, name: true, title: true },
        })
      : undefined;
    return { ...draft, recipient: recipient ?? null };
  });

export const saveMessageDraft = protectedProcedure
  .input(saveMessageDraftSchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "messages:send");
    if (input.studentId) await requireStudentAccess(context, input.studentId);
    if (input.recipientId) {
      const recipients = await recipientsFor(
        context,
        input.category,
        "",
        input.recipientId,
      );
      if (!recipients.some((person) => person.id === input.recipientId))
        throw new ORPCError("FORBIDDEN");
    }
    try {
      return await saveDraft(context.db, context.user.id, input);
    } catch (error) {
      if (error instanceof ManagementError)
        throw new ORPCError(error.code, { message: error.message });
      throw error;
    }
  });

export const sendMessageDraft = protectedProcedure
  .input(sendMessageDraftSchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "messages:send");
    const draft = await findDraft(context.db, context.user.id, input.id);
    if (!draft) throw new ORPCError("NOT_FOUND");
    if (draft.revision !== input.expectedRevision)
      throw new ORPCError("CONFLICT", {
        message: "message_draft.revision_conflict",
      });
    if (draft.sentMessageId) return { id: draft.sentMessageId };
    const parsed = v.safeParse(composeMessageSchema, {
      ...draft,
      recipientId: draft.recipientId ?? "",
      studentId: draft.studentId ?? "",
      fileIds: draft.files.map((file) => file.id),
    });
    if (!parsed.success)
      throw new ORPCError("BAD_REQUEST", {
        message: "message_draft.incomplete",
      });
    const data = parsed.output;
    if (data.studentId) await requireStudentAccess(context, data.studentId);
    const recipients = await recipientsFor(
      context,
      data.category,
      "",
      data.recipientId,
    );
    if (!recipients.some((person) => person.id === data.recipientId))
      throw new ORPCError("FORBIDDEN");
    try {
      return await sendDraft(
        context.db,
        context.user.id,
        input.id,
        input.expectedRevision,
        {
          senderId: context.user.id,
          category: data.category,
          studentId: data.studentId || null,
          subject: data.subject,
          body: data.body,
          bodyFormat: data.bodyFormat,
          document: data.document,
          fileIds: data.fileIds,
          recipientIds: [data.recipientId],
        },
      );
    } catch (error) {
      if (error instanceof ManagementError)
        throw new ORPCError(error.code, { message: error.message });
      throw error;
    }
  });
