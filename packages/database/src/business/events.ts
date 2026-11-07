import { and, desc, eq, inArray } from "drizzle-orm";

import type { JsonValue } from "../json";
import type { BusinessDb, BusinessTx } from "./client";

import { businessEvents } from "./schema";

export type BusinessEventRow = typeof businessEvents.$inferSelect;

export interface BusinessEvent {
  operatorId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  before?: JsonValue;
  after?: JsonValue;
  reason?: string | null;
}

/** Appends one business action to the log, in the caller's transaction. */
export async function recordEvent(
  tx: BusinessDb | BusinessTx,
  event: BusinessEvent,
): Promise<void> {
  await tx.insert(businessEvents).values({
    operatorId: event.operatorId,
    action: event.action,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    before: event.before ?? null,
    after: event.after ?? null,
    reason: event.reason ?? null,
  });
}

/** What was done to one subject, newest first. */
export function eventsOf(
  db: BusinessDb,
  subjectType: string,
  subjectId: string,
): Promise<BusinessEventRow[]> {
  return db
    .select()
    .from(businessEvents)
    .where(
      and(
        eq(businessEvents.subjectType, subjectType),
        eq(businessEvents.subjectId, subjectId),
      ),
    )
    .orderBy(desc(businessEvents.occurredAt))
    .limit(200);
}

/**
 * What was done to every subject of some kinds, newest first: all access
 * given and taken, or every change to the business's own settings.
 */
export function eventsAbout(
  db: BusinessDb,
  subjectTypes: readonly string[],
): Promise<BusinessEventRow[]> {
  return db
    .select()
    .from(businessEvents)
    .where(inArray(businessEvents.subjectType, [...subjectTypes]))
    .orderBy(desc(businessEvents.occurredAt))
    .limit(200);
}

/** The latest event of an action, as the daily round finds its last run. */
export async function lastEvent(
  db: BusinessDb,
  action: string,
): Promise<BusinessEventRow | null> {
  const [row] = await db
    .select()
    .from(businessEvents)
    .where(eq(businessEvents.action, action))
    .orderBy(desc(businessEvents.occurredAt))
    .limit(1);
  return row ?? null;
}
