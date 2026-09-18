import type { ContentDocument } from "@faridalms/domain/content";
import type {
  CalendarEventInput,
  MessageBodyFormat,
  RecipientCursor,
  NewslettersQuery,
} from "@faridalms/domain/school-schema";

import { contentPlainText } from "@faridalms/domain/content";
import { and, count, eq, isNull, sql, ilike } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../index";

import { schema } from "../index";
import { fileSummary, ownedReadyFiles } from "./files";
import { ManagementError } from "./management";
import { recordEvent } from "./notifications";

export type MessageFolder = "inbox" | "sent";

export interface ThreadRow {
  id: string;
  subject: string;
  category: (typeof schema.messageCategoryEnum.enumValues)[number];
  preview: string;
  latestAt: Date;
  latestSenderName: string;
  counterpartName: string;
  studentName: string | null;
  unreadCount: number;
  messageCount: number;
  attachmentCount: number;
}

/**
 * One row per conversation. Read state comes from `message_recipients`, so
 * the unread count is the viewer's own and a school-wide notice cannot be
 * marked read for everyone by whoever opens it first.
 */
export async function listMessages(
  db: Database,
  userId: string,
  folder: MessageFolder,
  search = "",
  requestedPage = 1,
) {
  const needle = `%${search.replaceAll(/[\\%_]/g, "\\$&")}%`;
  const participation = sql`
    with participation as (
      select coalesce(m.parent_message_id, m.id) as root_id,
        bool_or(r.recipient_id is not null) as received_any,
        count(*) filter (where r.recipient_id is not null and r.read_at is null)::int as unread_count,
        count(distinct m.id)::int as message_count,
        max(m.sent_at) as latest_at
      from messages m
      left join message_recipients r on r.message_id = m.id and r.recipient_id = ${userId}
      where m.sender_id = ${userId} or r.recipient_id is not null
      group by 1
    ),
    threads as (
      select root.id, root.subject, root.category, root.student_id, root.sender_id,
        p.unread_count, p.message_count, p.latest_at,
        (select left(latest.body, 160) from messages latest
          where coalesce(latest.parent_message_id, latest.id) = root.id
          order by latest.sent_at desc, latest.id desc limit 1) as preview,
        (select coalesce(sender.name, '') from messages latest join users sender on sender.id = latest.sender_id
          where coalesce(latest.parent_message_id, latest.id) = root.id
          order by latest.sent_at desc, latest.id desc limit 1) as latest_sender_name,
        case when root.sender_id = ${userId}
          then coalesce((select string_agg(recipient.name, ', ' order by recipient.name)
            from message_recipients delivery join users recipient on recipient.id = delivery.recipient_id
            where delivery.message_id = root.id), '')
          else coalesce((select name from users where id = root.sender_id), '')
        end as counterpart_name,
        (select st.first_name || ' ' || st.last_name from students st where st.id = root.student_id) as student_name,
        (select count(*)::int from message_attachments a join messages am on am.id = a.message_id
          where coalesce(am.parent_message_id, am.id) = root.id) as attachment_count,
        exists (select 1 from messages any_message
          where coalesce(any_message.parent_message_id, any_message.id) = root.id
            and (any_message.subject ilike ${needle} or any_message.body ilike ${needle})) as matches_text
      from participation p
      join messages root on root.id = p.root_id
      where ${folder === "sent" ? sql`root.sender_id = ${userId}` : sql`p.received_any`}
    )
    select * from threads
    where ${search ? sql`(matches_text or counterpart_name ilike ${needle})` : sql`true`}`;
  const counted = (await db.execute(
    sql`select count(*)::int as total from (${participation}) counted`,
  )) as unknown as { total: number }[];
  const total = counted[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const page = Math.min(requestedPage, pages);
  const rows = (await db.execute(
    sql`${participation} order by latest_at desc, id limit 25 offset ${(page - 1) * 25}`,
  )) as unknown as {
    id: string;
    subject: string;
    category: ThreadRow["category"];
    preview: string | null;
    latest_at: Date | string;
    latest_sender_name: string;
    counterpart_name: string;
    student_name: string | null;
    unread_count: number;
    message_count: number;
    attachment_count: number;
  }[];
  return {
    rows: rows.map((row): ThreadRow => ({
      id: row.id,
      subject: row.subject,
      category: row.category,
      preview: row.preview ?? "",
      latestAt: new Date(row.latest_at),
      latestSenderName: row.latest_sender_name,
      counterpartName: row.counterpart_name,
      studentName: row.student_name,
      unreadCount: row.unread_count,
      messageCount: row.message_count,
      attachmentCount: row.attachment_count,
    })),
    total,
    page,
    pages,
  };
}

const messageWith = {
  sender: { columns: { id: true, name: true, role: true } },
  attachments: { with: { file: true } },
  recipients: {
    with: { recipient: { columns: { id: true, name: true } } },
  },
} as const;

function attachmentsOf(
  rows: {
    id: string;
    name: string;
    sizeBytes: number;
    fileId: string | null;
    file: {
      id: string;
      name: string;
      mediaType: string;
      sizeBytes: number;
    } | null;
  }[],
) {
  return rows.map((row) => ({
    id: row.id,
    name: row.file?.name ?? row.name,
    sizeBytes: row.file?.sizeBytes ?? row.sizeBytes,
    mediaType: row.file?.mediaType ?? null,
    file: row.file ? fileSummary(row.file) : null,
  }));
}

/**
 * The whole conversation the message belongs to, however deep the link went
 * in. Only participants may read it, and each reader sees the addressees
 * they are allowed to know about.
 */
export async function getMessageThread(
  db: Database,
  messageId: string,
  userId: string,
) {
  const anchor = await db.query.messages.findFirst({
    where: { id: messageId },
    columns: { id: true, parentMessageId: true },
  });
  if (!anchor) return undefined;
  const rootId = anchor.parentMessageId ?? anchor.id;
  const root = await db.query.messages.findFirst({
    where: { id: rootId },
    with: {
      ...messageWith,
      student: { columns: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!root) return undefined;
  const isParticipant =
    root.senderId === userId ||
    root.recipients.some((link) => link.recipientId === userId);
  if (!isParticipant) return undefined;

  const replies = await db.query.messages.findMany({
    where: {
      parentMessageId: rootId,
      OR: [{ senderId: userId }, { recipients: { recipientId: userId } }],
    },
    with: messageWith,
    orderBy: { sentAt: "asc" },
  });
  const own = (links: { recipientId: string; readAt: Date | null }[]) =>
    links.find((link) => link.recipientId === userId)?.readAt ?? null;
  return {
    ...root,
    focusId: messageId,
    attachments: attachmentsOf(root.attachments),
    readAt: own(root.recipients),
    recipients:
      root.senderId === userId
        ? root.recipients
        : root.recipients.filter((link) => link.recipientId === userId),
    participants: [
      ...new Map(
        [
          root.sender ? [root.sender.id, root.sender] : null,
          ...root.recipients.map((link) =>
            link.recipient ? [link.recipient.id, link.recipient] : null,
          ),
        ].filter((entry): entry is [string, { id: string; name: string }] =>
          Boolean(entry),
        ),
      ).values(),
    ],
    replies: replies.map((reply) => ({
      ...reply,
      attachments: attachmentsOf(reply.attachments),
      readAt: own(reply.recipients),
      recipients: undefined,
    })),
  };
}

/** Marks every message in the thread read for this reader only. */
export async function markThreadRead(
  db: Database,
  rootId: string,
  userId: string,
) {
  await db
    .update(schema.messageRecipients)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.messageRecipients.recipientId, userId),
        isNull(schema.messageRecipients.readAt),
        sql`${schema.messageRecipients.messageId} in (
          select ${schema.messages.id} from ${schema.messages}
          where ${schema.messages.id} = ${rootId} or ${schema.messages.parentMessageId} = ${rootId})`,
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
  senderName?: string;
  category: (typeof schema.messageCategoryEnum.enumValues)[number];
  studentId: string | null;
  subject: string;
  body: string;
  bodyFormat?: MessageBodyFormat;
  document?: ContentDocument | null;
  fileIds?: string[];
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
  const document =
    input.bodyFormat === "rich" ? (input.document ?? null) : null;
  const body = document
    ? contentPlainText(document).trim().slice(0, 20000)
    : input.body;
  if (!body && !document)
    throw new ManagementError("BAD_REQUEST", "message.empty");
  const fileIds = input.fileIds ?? [];
  const files = await ownedReadyFiles(
    tx,
    input.senderId,
    fileIds,
    "message_attachment",
  );
  if (files.length !== fileIds.length)
    throw new ManagementError("BAD_REQUEST", "message.file_missing");
  const [row] = await tx
    .insert(schema.messages)
    .values({
      senderId: input.senderId,
      category: input.category,
      studentId: input.studentId,
      subject: input.subject,
      body,
      bodyFormat: input.bodyFormat ?? "plain",
      document,
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
  if (files.length > 0) {
    await tx.insert(schema.messageAttachments).values(
      files.map((file) => ({
        messageId: row.id,
        fileId: file.id,
        name: file.name,
        sizeBytes: file.sizeBytes,
        url: null,
      })),
    );
  }
  await recordEvent(tx, {
    type: "message_received",
    subjectId: row.id,
    actorId: input.senderId,
    payload: {
      title: input.subject,
      preview: body.slice(0, 160),
      actorName: input.senderName ?? null,
      studentName: null,
      link: { kind: "message", id: input.parentMessageId ?? row.id },
    },
    recipientIds: input.recipientIds,
  });
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
      hasDocument: sql<boolean>`${schema.newsletters.document} is not null`,
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
