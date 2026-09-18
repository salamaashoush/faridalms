import type {
  CalendarEventInput,
  RecipientCursor,
  NewslettersQuery,
} from "@faridalms/domain/school-schema";

import { and, count, eq, isNull, sql, ilike, or, desc } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../index";

import { schema } from "../index";

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
  db: Database,
  userId: string,
  folder: MessageFolder,
  search = "",
  requestedPage = 1,
) {
  const { messages, users, students, messageRecipients, messageAttachments } =
    schema;
  const counterpartName =
    folder === "sent"
      ? sql<string>`coalesce((select string_agg(recipient.name, ', ' order by recipient.name) from message_recipients delivery join users recipient on recipient.id=delivery.recipient_id where delivery.message_id=${messages.id}), '')`
      : sql<string>`coalesce(${users.name}, '')`;
  const visibility =
    folder === "sent"
      ? eq(messages.senderId, userId)
      : sql`exists(select 1 from ${messageRecipients} where ${messageRecipients.messageId}=${messages.id} and ${messageRecipients.recipientId}=${userId})`;
  const needle = `%${search.replaceAll(/[\\%_]/g, "\\$&")}%`;
  const filter = and(
    visibility,
    search
      ? or(
          ilike(messages.subject, needle),
          ilike(messages.body, needle),
          ilike(counterpartName, needle),
        )
      : undefined,
  );
  const [counts] = await db
    .select({ total: count() })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id))
    .where(filter);
  const total = counts?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const page = Math.min(requestedPage, pages);
  const rows = await db
    .select({
      id: messages.id,
      subject: messages.subject,
      preview: sql<string>`left(${messages.body},160)`,
      sentAt: messages.sentAt,
      category: messages.category,
      counterpartName,
      studentName: sql<
        string | null
      >`${students.firstName} || ' ' || ${students.lastName}`,
      unread: sql<boolean>`exists(select 1 from ${messageRecipients} where ${messageRecipients.messageId}=${messages.id} and ${messageRecipients.recipientId}=${userId} and ${messageRecipients.readAt} is null)`,
      attachmentCount: sql<number>`(select count(*)::int from ${messageAttachments} where ${messageAttachments.messageId}=${messages.id})`,
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id))
    .leftJoin(students, eq(messages.studentId, students.id))
    .where(filter)
    .orderBy(desc(messages.sentAt), messages.id)
    .limit(25)
    .offset((page - 1) * 25);
  return { rows, total, page, pages };
}

export async function getMessageThread(
  db: Database,
  messageId: string,
  userId: string,
) {
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
    where: {
      parentMessageId: messageId,
      OR: [{ senderId: userId }, { recipients: { recipientId: userId } }],
    },
    with: {
      sender: { columns: { id: true, name: true } },
      attachments: true,
    },
    orderBy: { sentAt: "asc" },
  });

  return {
    ...message,
    recipients:
      message.senderId === userId
        ? message.recipients
        : message.recipients.filter((link) => link.recipientId === userId),
    replies,
  };
}

export async function markRead(
  db: Database,
  messageId: string,
  userId: string,
) {
  await db
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

export async function unreadCount(
  db: Database,
  userId: string,
): Promise<number> {
  const [row] = await db
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
  bodyFormat?: "plain" | "markdown";
  recipientIds: string[];
  parentMessageId?: string;
}

export async function sendMessage(
  db: Database,
  input: ComposeInput,
): Promise<string> {
  // The message and its delivery rows must land together, or a send that fails
  // halfway leaves a message nobody receives.
  return db.transaction((tx) => insertMessage(tx, input));
}

export async function insertMessage(
  tx: DatabaseTransaction,
  input: ComposeInput,
): Promise<string> {
  const [row] = await tx
    .insert(schema.messages)
    .values({
      senderId: input.senderId,
      category: input.category,
      studentId: input.studentId,
      subject: input.subject,
      body: input.body,
      bodyFormat: input.bodyFormat ?? "plain",
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
}

/** Who a given user is allowed to write to. */
export async function availableRecipients(
  db: Database,
  category: (typeof schema.messageCategoryEnum.enumValues)[number],
  options: {
    ids?: string[];
    query?: string;
    recipientId?: string;
    cursor?: RecipientCursor;
  } = {},
) {
  const cursor = options.cursor;
  const role = {
    teachers: "teacher",
    administration: "admin",
    parents: "parent",
    students: "student",
  } as const;
  return db.query.users.findMany({
    columns: { id: true, name: true, title: true, role: true },
    where: {
      role: role[category],
      isActive: true,
      ...(cursor
        ? {
            RAW: (table) =>
              sql`(${table.name}, ${table.id}) > (${cursor.name}, ${cursor.id}::uuid)`,
          }
        : {}),
      ...(options.recipientId ? { id: options.recipientId } : {}),
      ...(options.ids ? { AND: [{ id: { in: options.ids } }] } : {}),
      ...(options.query
        ? {
            name: { ilike: `%${options.query.replaceAll(/[\\%_]/g, "\\$&")}%` },
          }
        : {}),
    },
    orderBy: { name: "asc", id: "asc" },
    limit: 51,
  });
}

export async function listNewsletters(db: Database, query: NewslettersQuery) {
  const needle = `%${query.q.replaceAll(/[\\%_]/g, "\\$&")}%`;
  const filter = query.q ? ilike(schema.newsletters.title, needle) : undefined;
  const [counts] = await db
    .select({ total: count() })
    .from(schema.newsletters)
    .where(filter);
  const total = counts?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const page = Math.min(query.page, pages);
  const column =
    query.sort === "title"
      ? schema.newsletters.title
      : schema.newsletters.publishedOn;
  const order = query.dir === "asc" ? sql`${column} asc` : sql`${column} desc`;
  const rows = await db
    .select({
      id: schema.newsletters.id,
      title: schema.newsletters.title,
      summary: schema.newsletters.summary,
      url: schema.newsletters.url,
      publishedOn: schema.newsletters.publishedOn,
    })
    .from(schema.newsletters)
    .where(filter)
    .orderBy(order, schema.newsletters.id)
    .limit(25)
    .offset((page - 1) * 25);
  return { rows, total, page, pages };
}

export async function listEvents(
  db: Database,
  schoolYearId: string,
  categories: (typeof schema.eventCategoryEnum.enumValues)[number][] = [],
) {
  return db.query.calendarEvents.findMany({
    where: {
      schoolYearId,
      ...(categories.length > 0 ? { category: { in: categories } } : {}),
    },
    orderBy: { startsOn: "asc" },
  });
}

/** Events overlapping an inclusive date range. */
export async function eventsInRange(
  db: Database,
  schoolYearId: string,
  from: string,
  to: string,
) {
  return db.query.calendarEvents.findMany({
    where: {
      schoolYearId,
      startsOn: { lte: to },
      endsOn: { gte: from },
    },
    orderBy: { startsOn: "asc" },
  });
}

export async function upcomingEvents(
  db: Database,
  schoolYearId: string,
  today: string,
  limit: number,
) {
  return db.query.calendarEvents.findMany({
    where: { schoolYearId, endsOn: { gte: today } },
    orderBy: { startsOn: "asc" },
    limit,
  });
}

export async function saveCalendarEvent(
  db: Database,
  schoolYearId: string,
  input: CalendarEventInput,
) {
  const { id, expectedRevision, ...values } = input;
  if (id) {
    if (expectedRevision === undefined) return undefined;
    return (
      await db
        .update(schema.calendarEvents)
        .set({
          ...values,
          revision: sql`${schema.calendarEvents.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.calendarEvents.id, id),
            eq(schema.calendarEvents.schoolYearId, schoolYearId),
            eq(schema.calendarEvents.revision, expectedRevision),
          ),
        )
        .returning()
    )[0];
  }
  return (
    await db
      .insert(schema.calendarEvents)
      .values({ ...values, schoolYearId })
      .returning()
  )[0];
}
