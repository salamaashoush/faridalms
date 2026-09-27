import { and, count, eq, isNull } from "drizzle-orm";

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
