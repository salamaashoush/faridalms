import type { BusinessDb, BusinessTx } from "./client";

import { businessEvents } from "./schema";

export interface BusinessEvent {
  operatorId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  before?: unknown;
  after?: unknown;
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
