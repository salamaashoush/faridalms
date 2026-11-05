import type { TaskKind } from "@faridalms/domain/tasks";

import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";

import type { BusinessDb } from "./client";

import { recordEvent } from "./events";
import { customers, tasks } from "./schema";

export type TaskRow = typeof tasks.$inferSelect;

/**
 * Tasks with their customer's name: open ones by the day they are due, or
 * a customer's, open first and then the latest done.
 */
export function listTasks(
  db: BusinessDb,
  filter: { customerId?: string; open?: boolean } = {},
) {
  return db
    .select({ task: tasks, customerName: customers.legalNameEn })
    .from(tasks)
    .innerJoin(customers, eq(customers.id, tasks.customerId))
    .where(
      and(
        filter.customerId ? eq(tasks.customerId, filter.customerId) : undefined,
        filter.open ? isNull(tasks.doneAt) : undefined,
      ),
    )
    .orderBy(asc(isNotNull(tasks.doneAt)), asc(tasks.dueOn), desc(tasks.doneAt))
    .limit(200);
}

/** Asks an operator to do something, once for what made it; false when it was already asked. */
export async function addTask(
  db: BusinessDb,
  input: {
    customerId: string;
    kind: TaskKind;
    invoiceId: string | null;
    key: string;
    title: string;
    dueOn: string;
    assigneeId: string | null;
    by: string;
  },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(tasks)
      .values({
        customerId: input.customerId,
        kind: input.kind,
        invoiceId: input.invoiceId,
        key: input.key,
        title: input.title,
        dueOn: input.dueOn,
        assigneeId: input.assigneeId,
        createdBy: input.by,
      })
      .onConflictDoNothing({ target: tasks.key })
      .returning({ id: tasks.id });
    if (!created) return false;
    await recordEvent(tx, {
      operatorId: input.by,
      action: "task.create",
      subjectType: "customer",
      subjectId: input.customerId,
      after: { taskId: created.id, kind: input.kind, title: input.title },
    });
    return true;
  });
}

/** Closes an open task with what came of it; false when it is not open. */
export async function finishTask(
  db: BusinessDb,
  input: { id: string; outcome: string; by: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [done] = await tx
      .update(tasks)
      .set({ doneAt: new Date(), doneBy: input.by, outcome: input.outcome })
      .where(and(eq(tasks.id, input.id), isNull(tasks.doneAt)))
      .returning({ customerId: tasks.customerId, title: tasks.title });
    if (!done) return false;
    await recordEvent(tx, {
      operatorId: input.by,
      action: "task.done",
      subjectType: "customer",
      subjectId: done.customerId,
      after: { taskId: input.id, title: done.title },
      reason: input.outcome,
    });
    return true;
  });
}
