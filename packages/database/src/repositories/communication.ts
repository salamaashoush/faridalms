import type {
  CalendarEventInput,
  NewslettersQuery,
} from "@faridalms/domain/school-schema";

import { contentPlainText } from "@faridalms/domain/content";
import { plainContent } from "@faridalms/domain/content-conversion";
import { and, count, eq, isNull, sql, ilike } from "drizzle-orm";

import type { Database } from "../index";

import { schema } from "../index";

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

/** Who a given user is allowed to write to. */
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
  const { id, expectedRevision, document, description, ...rest } = input;
  const content = document ?? plainContent(description ?? "");
  const values = {
    ...rest,
    document: content,
    description: contentPlainText(content).trim().slice(0, 20000),
  };
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
