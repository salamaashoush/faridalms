import { and, count, eq, isNull } from "drizzle-orm";

import { getDb, schema } from "~/db";

export type MessageFolder = "inbox" | "sent";

export interface MessageListRow {
  id: string;
  subject: string;
  preview: string;
  sentAt: Date;
  category: (typeof schema.messageCategoryEnum.enumValues)[number];
  counterpartName: string;
  studentName: string | null;
  unread: boolean;
  attachmentCount: number;
}

/**
 * Inbox is driven by `message_recipients`, not by a column on `messages`, so
 * read state is per person and a school-wide notice cannot be marked read for
 * everyone by whoever opens it first.
 */
export async function listMessages(
  userId: string,
  folder: MessageFolder,
  search = "",
): Promise<MessageListRow[]> {
  const db = getDb();
  const needle = search.trim().toLowerCase();

  if (folder === "sent") {
    const rows = await db.query.messages.findMany({
      where: { senderId: userId },
      with: {
        student: { columns: { firstName: true, lastName: true } },
        recipients: { with: { recipient: { columns: { name: true } } } },
        attachments: { columns: { id: true } },
      },
      orderBy: { sentAt: "desc" },
    });

    return rows
      .map((row) => ({
        id: row.id,
        subject: row.subject,
        preview: row.body.slice(0, 160),
        sentAt: row.sentAt,
        category: row.category,
        counterpartName:
          row.recipients
            .map((link) => link.recipient?.name)
            .filter(Boolean)
            .join(", ") || "",
        studentName: row.student
          ? `${row.student.firstName} ${row.student.lastName}`
          : null,
        unread: false,
        attachmentCount: row.attachments.length,
      }))
      .filter((row) => matches(row, needle));
  }

  const rows = await db.query.messageRecipients.findMany({
    where: { recipientId: userId },
    with: {
      message: {
        with: {
          sender: { columns: { name: true } },
          student: { columns: { firstName: true, lastName: true } },
          attachments: { columns: { id: true } },
        },
      },
    },
  });

  return rows
    .flatMap((link) => {
      // The join row cannot outlive its message (cascade delete), but the
      // relational builder still types it as nullable.
      const message = link.message;
      if (!message) {
        return [];
      }
      return [
        {
          id: message.id,
          subject: message.subject,
          preview: message.body.slice(0, 160),
          sentAt: message.sentAt,
          category: message.category,
          counterpartName: message.sender?.name ?? "",
          studentName: message.student
            ? `${message.student.firstName} ${message.student.lastName}`
            : null,
          unread: link.readAt === null,
          attachmentCount: message.attachments.length,
        },
      ];
    })
    .filter((row) => matches(row, needle))
    .toSorted((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
}

function matches(
  row: { subject: string; preview: string; counterpartName: string },
  needle: string,
): boolean {
  if (!needle) {
    return true;
  }
  return `${row.subject} ${row.preview} ${row.counterpartName}`
    .toLowerCase()
    .includes(needle);
}

export async function getMessageThread(messageId: string, userId: string) {
  const db = getDb();

  const message = await db.query.messages.findFirst({
    where: { id: messageId },
    with: {
      sender: { columns: { id: true, name: true, role: true } },
      student: { columns: { id: true, firstName: true, lastName: true } },
      attachments: true,
      recipients: {
        with: { recipient: { columns: { id: true, name: true } } },
      },
    },
  });

  if (!message) {
    return undefined;
  }

  // Only the sender and the addressees may read it.
  const isParticipant =
    message.senderId === userId ||
    message.recipients.some((link) => link.recipientId === userId);
  if (!isParticipant) {
    return undefined;
  }

  const replies = await db.query.messages.findMany({
    where: { parentMessageId: messageId },
    with: {
      sender: { columns: { id: true, name: true } },
      attachments: true,
    },
    orderBy: { sentAt: "asc" },
  });

  return { ...message, replies };
}

export async function markRead(messageId: string, userId: string) {
  await getDb()
    .update(schema.messageRecipients)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.messageRecipients.messageId, messageId),
        eq(schema.messageRecipients.recipientId, userId),
        isNull(schema.messageRecipients.readAt),
      ),
    );
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(schema.messageRecipients)
    .where(
      and(
        eq(schema.messageRecipients.recipientId, userId),
        isNull(schema.messageRecipients.readAt),
      ),
    );
  return row?.n ?? 0;
}

export interface ComposeInput {
  senderId: string;
  category: (typeof schema.messageCategoryEnum.enumValues)[number];
  studentId: string | null;
  subject: string;
  body: string;
  recipientIds: string[];
  parentMessageId?: string;
}

export async function sendMessage(input: ComposeInput): Promise<string> {
  const db = getDb();

  // The message and its delivery rows must land together, or a send that fails
  // halfway leaves a message nobody receives.
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.messages)
      .values({
        senderId: input.senderId,
        category: input.category,
        studentId: input.studentId,
        subject: input.subject,
        body: input.body,
        parentMessageId: input.parentMessageId ?? null,
      })
      .returning({ id: schema.messages.id });

    if (!row) {
      throw new Error("Message insert returned nothing");
    }
    if (input.recipientIds.length > 0) {
      await tx.insert(schema.messageRecipients).values(
        input.recipientIds.map((recipientId) => ({
          messageId: row.id,
          recipientId,
        })),
      );
    }
    return row.id;
  });
}

/** Who a given user is allowed to write to. */
export async function availableRecipients(
  category: (typeof schema.messageCategoryEnum.enumValues)[number],
) {
  return getDb().query.users.findMany({
    columns: { id: true, name: true, title: true, role: true },
    where: {
      role: category === "teachers" ? "teacher" : "admin",
      isActive: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function listNewsletters(search = "") {
  const rows = await getDb().query.newsletters.findMany({
    with: { schoolYear: { columns: { name: true } } },
    orderBy: { publishedOn: "desc" },
  });
  const needle = search.trim().toLowerCase();
  return needle
    ? rows.filter((row) => row.title.toLowerCase().includes(needle))
    : rows;
}

export async function listEvents(
  schoolYearId: string,
  categories: (typeof schema.eventCategoryEnum.enumValues)[number][] = [],
) {
  return getDb().query.calendarEvents.findMany({
    where: {
      schoolYearId,
      ...(categories.length > 0 ? { category: { in: categories } } : {}),
    },
    orderBy: { startsOn: "asc" },
  });
}

/** Events overlapping an inclusive date range. */
export async function eventsInRange(
  schoolYearId: string,
  from: string,
  to: string,
) {
  return getDb().query.calendarEvents.findMany({
    where: {
      schoolYearId,
      startsOn: { lte: to },
      endsOn: { gte: from },
    },
    orderBy: { startsOn: "asc" },
  });
}

export async function upcomingEvents(
  schoolYearId: string,
  today: string,
  limit: number,
) {
  return getDb().query.calendarEvents.findMany({
    where: { schoolYearId, endsOn: { gte: today } },
    orderBy: { startsOn: "asc" },
    limit,
  });
}
