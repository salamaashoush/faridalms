import type {
  NotificationChannel,
  NotificationPayload,
  NotificationType,
  SaveNotificationPreferencesInput,
} from "@faridalms/domain/notification";

import { retryDelayMs } from "@faridalms/domain/notification";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../index";

import { schema } from "../index";

type Executor = Database | DatabaseTransaction;

const DEFAULT_PREFERENCES = {
  email: true,
  sms: false,
  locale: "en" as const,
  mutedTypes: [] as NotificationType[],
};

/**
 * Writes the event, one in-app notification per recipient and one delivery
 * row per enabled channel, inside the caller's transaction. In-app rows are
 * delivered by existing; email and SMS wait for the worker, and a channel the
 * person disabled, muted or has no address for is recorded as skipped so the
 * audit says why nothing was sent.
 */
export async function recordEvent(
  tx: Executor,
  input: {
    type: NotificationType;
    subjectId: string;
    actorId: string | null;
    payload: NotificationPayload;
    recipientIds: string[];
  },
) {
  const recipientIds = [...new Set(input.recipientIds)].filter(
    (id) => id !== input.actorId,
  );
  const [event] = await tx
    .insert(schema.notificationEvents)
    .values({
      type: input.type,
      subjectId: input.subjectId,
      actorId: input.actorId,
      payload: input.payload,
      recipientCount: recipientIds.length,
    })
    .returning({ id: schema.notificationEvents.id });
  if (!event) throw new Error("notification.event_failed");
  if (recipientIds.length === 0) return event;
  const people = await tx.query.users.findMany({
    where: { id: { in: recipientIds }, isActive: true },
    columns: { id: true, email: true, mobile: true },
    with: { notificationPreferences: true },
  });
  const rows = await tx
    .insert(schema.notifications)
    .values(
      people.map((person) => ({
        eventId: event.id,
        recipientId: person.id,
        type: input.type,
        payload: input.payload,
      })),
    )
    .onConflictDoNothing()
    .returning({
      id: schema.notifications.id,
      recipientId: schema.notifications.recipientId,
    });
  const byRecipient = new Map(people.map((person) => [person.id, person]));
  const now = new Date();
  const deliveries = rows.flatMap((row) => {
    const person = byRecipient.get(row.recipientId);
    const preferences = person?.notificationPreferences ?? DEFAULT_PREFERENCES;
    const muted = preferences.mutedTypes.includes(input.type);
    const channel = (
      name: NotificationChannel,
      enabled: boolean,
      address: string | null,
    ) => ({
      notificationId: row.id,
      channel: name,
      address,
      state: muted
        ? ("skipped" as const)
        : !enabled
          ? ("skipped" as const)
          : !address
            ? ("skipped" as const)
            : ("pending" as const),
      lastError: muted
        ? "muted"
        : !enabled
          ? "disabled"
          : !address
            ? "no_address"
            : null,
      nextAttemptAt: !muted && enabled && address ? now : null,
    });
    return [
      {
        notificationId: row.id,
        channel: "in_app" as const,
        address: null,
        state: muted ? ("skipped" as const) : ("sent" as const),
        lastError: muted ? "muted" : null,
        nextAttemptAt: null,
        sentAt: muted ? null : now,
      },
      channel("email", preferences.email, person?.email ?? null),
      channel("sms", preferences.sms, person?.mobile ?? null),
    ];
  });
  if (deliveries.length)
    await tx
      .insert(schema.notificationDeliveries)
      .values(deliveries)
      .onConflictDoNothing();
  return event;
}

/** Everyone who should hear about an assignment: its learners and their guardians. */
export async function assignmentAudience(tx: Executor, assignmentId: string) {
  const rows = await tx.query.assignmentRecipients.findMany({
    where: { assignmentId },
    with: {
      student: {
        columns: { userId: true },
        with: { guardianships: { columns: { guardianId: true } } },
      },
    },
  });
  return rows.flatMap((row) => [
    ...(row.student?.userId ? [row.student.userId] : []),
    ...(row.student?.guardianships.map((link) => link.guardianId) ?? []),
  ]);
}

export async function studentAudience(tx: Executor, studentId: string) {
  const student = await tx.query.students.findFirst({
    where: { id: studentId },
    columns: { userId: true, firstName: true, lastName: true },
    with: { guardianships: { columns: { guardianId: true } } },
  });
  return {
    name: student ? `${student.firstName} ${student.lastName}` : null,
    userIds: [
      ...(student?.userId ? [student.userId] : []),
      ...(student?.guardianships.map((link) => link.guardianId) ?? []),
    ],
  };
}

export async function roleAudience(
  tx: Executor,
  roles: ("admin" | "teacher" | "parent" | "student")[],
) {
  if (roles.length === 0) return [];
  const rows = await tx.query.users.findMany({
    where: { role: { in: roles }, isActive: true },
    columns: { id: true },
  });
  return rows.map((row) => row.id);
}

export async function listNotifications(
  db: Database,
  userId: string,
  requestedPage: number,
  unreadOnly = false,
) {
  const filter = and(
    eq(schema.notifications.recipientId, userId),
    unreadOnly ? isNull(schema.notifications.readAt) : undefined,
  );
  const [counts] = await db
    .select({ total: count() })
    .from(schema.notifications)
    .where(filter);
  const total = counts?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const page = Math.min(requestedPage, pages);
  const rows = await db.query.notifications.findMany({
    where: {
      recipientId: userId,
      ...(unreadOnly ? { readAt: { isNull: true } } : {}),
    },
    columns: {
      id: true,
      type: true,
      payload: true,
      readAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc", id: "desc" },
    limit: 25,
    offset: (page - 1) * 25,
  });
  return { rows, total, page, pages };
}

export async function unreadNotificationCount(db: Executor, userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.recipientId, userId),
        isNull(schema.notifications.readAt),
      ),
    );
  return row?.n ?? 0;
}

export async function markNotificationsRead(
  db: Database,
  userId: string,
  ids: string[],
) {
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.recipientId, userId),
        isNull(schema.notifications.readAt),
        ids.length ? inArray(schema.notifications.id, ids) : undefined,
      ),
    );
}

export async function getNotificationPreferences(db: Database, userId: string) {
  const row = await db.query.notificationPreferences.findFirst({
    where: { userId },
  });
  return row
    ? {
        email: row.email,
        sms: row.sms,
        locale: row.locale,
        mutedTypes: row.mutedTypes,
      }
    : DEFAULT_PREFERENCES;
}

export async function saveNotificationPreferences(
  db: Database,
  userId: string,
  input: SaveNotificationPreferencesInput,
) {
  const values = {
    email: input.email,
    sms: input.sms,
    locale: input.locale,
    mutedTypes: input.mutedTypes,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.notificationPreferences)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: schema.notificationPreferences.userId,
      set: values,
    });
  return getNotificationPreferences(db, userId);
}

/** Deliveries a worker may attempt now, locked so two workers never send twice. */
export async function claimPendingDeliveries(
  tx: DatabaseTransaction,
  limit: number,
) {
  const rows = await tx.execute(sql`
    select d.id from ${schema.notificationDeliveries} d
    where d.state = 'pending' and d.channel <> 'in_app'
      and (d.next_attempt_at is null or d.next_attempt_at <= now())
    order by d.next_attempt_at nulls first, d.created_at
    limit ${limit}
    for update skip locked`);
  const ids = (rows as unknown as { id: string }[]).map((row) => row.id);
  if (ids.length === 0) return [];
  return tx.query.notificationDeliveries.findMany({
    where: { id: { in: ids } },
    with: {
      notification: {
        columns: { id: true, type: true, payload: true, recipientId: true },
        with: {
          recipient: {
            columns: { id: true, name: true },
            with: { notificationPreferences: { columns: { locale: true } } },
          },
        },
      },
    },
  });
}

export async function completeDelivery(
  tx: Executor,
  id: string,
  receipt: string | null,
) {
  await tx
    .update(schema.notificationDeliveries)
    .set({
      state: "sent",
      attempts: sql`${schema.notificationDeliveries.attempts} + 1`,
      providerReceipt: receipt,
      lastError: null,
      sentAt: new Date(),
      nextAttemptAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.notificationDeliveries.id, id));
}

/** A failed attempt schedules the next one, or gives up after the last allowed try. */
export async function failDelivery(
  tx: Executor,
  id: string,
  attempts: number,
  error: string,
  permanent = false,
  retryBaseMs = 60_000,
) {
  const next = attempts + 1;
  const delay = permanent ? null : retryDelayMs(next, retryBaseMs);
  await tx
    .update(schema.notificationDeliveries)
    .set({
      state: delay === null ? (permanent ? "skipped" : "failed") : "pending",
      attempts: next,
      lastError: error.slice(0, 1000),
      nextAttemptAt: delay === null ? null : new Date(Date.now() + delay),
      updatedAt: new Date(),
    })
    .where(eq(schema.notificationDeliveries.id, id));
}

export async function deliveryAudit(
  db: Database,
  query: {
    page: number;
    q: string;
    state: "all" | "pending" | "sent" | "failed" | "skipped";
    channel: "all" | NotificationChannel;
  },
) {
  const {
    notificationDeliveries: deliveries,
    notifications: rows,
    users,
  } = schema;
  const needle = `%${query.q.replaceAll(/[\\%_]/g, "\\$&")}%`;
  const filter = and(
    query.state === "all" ? undefined : eq(deliveries.state, query.state),
    query.channel === "all" ? undefined : eq(deliveries.channel, query.channel),
    query.q
      ? sql`(${deliveries.address} ilike ${needle} or ${users.name} ilike ${needle} or ${rows.payload}->>'title' ilike ${needle})`
      : undefined,
  );
  const base = db
    .select({
      id: deliveries.id,
      channel: deliveries.channel,
      state: deliveries.state,
      address: deliveries.address,
      attempts: deliveries.attempts,
      lastError: deliveries.lastError,
      providerReceipt: deliveries.providerReceipt,
      sentAt: deliveries.sentAt,
      createdAt: deliveries.createdAt,
      type: rows.type,
      payload: rows.payload,
      notifiedAt: rows.createdAt,
      recipientId: users.id,
      recipientName: users.name,
    })
    .from(deliveries)
    .innerJoin(rows, eq(rows.id, deliveries.notificationId))
    .innerJoin(users, eq(users.id, rows.recipientId))
    .where(filter);
  const [counts] = await db
    .select({ total: count() })
    .from(deliveries)
    .innerJoin(rows, eq(rows.id, deliveries.notificationId))
    .innerJoin(users, eq(users.id, rows.recipientId))
    .where(filter);
  const total = counts?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const page = Math.min(query.page, pages);
  const found = await base
    .orderBy(sql`${deliveries.createdAt} desc`, sql`${deliveries.id} desc`)
    .limit(25)
    .offset((page - 1) * 25);
  return {
    rows: found.map((row) => ({
      id: row.id,
      channel: row.channel,
      state: row.state,
      address: row.address,
      attempts: row.attempts,
      lastError: row.lastError,
      providerReceipt: row.providerReceipt,
      sentAt: row.sentAt,
      createdAt: row.createdAt,
      notification: {
        type: row.type,
        payload: row.payload,
        createdAt: row.notifiedAt,
        recipient: { id: row.recipientId, name: row.recipientName },
      },
    })),
    total,
    page,
    pages,
  };
}

export async function deliveriesFor(db: Database, notificationId: string) {
  return db.query.notificationDeliveries.findMany({
    where: { notificationId },
    orderBy: { channel: "asc" },
  });
}
