import type {
  NewDelivery,
  NewNotification,
} from "@faridalms/database/stores/notifications";
import type {
  DeliveryChannel,
  NoticeParams,
  NotificationKind,
} from "@faridalms/domain/notifications";

import { schoolProfile } from "@faridalms/database/stores/identity";
import {
  holdingUnread,
  insertDeliveries,
  insertNotifications,
  reachability,
} from "@faridalms/database/stores/notifications";
import { deliveryTime, preferencesOf } from "@faridalms/domain/notifications";

import type { UnitContext } from "./context";
import type { ModuleScope } from "./extension";

import { contributionsTo, point } from "./extension";

/** A channel beyond email that a module sends notices by: texts, say. */
export interface NoticeChannel {
  channel: Exclude<DeliveryChannel, "email">;
}

export const noticeChannels = point<NoticeChannel>("notice channels");

/** The channels a school sends notices by: email, and those its modules on add. */
export async function channelsOf(
  scope: ModuleScope,
): Promise<DeliveryChannel[]> {
  return [
    "email",
    ...(await contributionsTo(scope, noticeChannels)).map((row) => row.channel),
  ];
}

export interface Notice {
  kind: NotificationKind;
  subject: { type: string; id: string };
  params: NoticeParams;
  needsAction?: boolean;
  /** Minutes before email and texts go, so a mistake can be put right first. */
  delayMinutes?: number;
  /** Skip people who have not yet read an earlier notice of this kind about the same subject. */
  collapse?: boolean;
}

/**
 * Tells people something in the app and plans how it reaches them outside
 * it, each by their own choices and hours. Every channel the school has gets
 * a ledger row, including the ones that will not be used and why, so the
 * office can answer "why did I get nothing". A channel beyond email is one
 * only where a module on adds it.
 */
export async function notify(
  context: UnitContext,
  userIds: readonly string[],
  notice: Notice,
): Promise<number> {
  return notifyIn(
    {
      tx: context.tx,
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      school: context.school,
      extensions: context.extensions,
      actorUserId: context.actor.userId,
      now: context.now,
      channels: context.channels,
    },
    userIds,
    notice,
  );
}

/** Where a notice is written when no signed-in person sends it, such as a visitor's form. */
export interface NoticeScope extends ModuleScope {
  /** Who caused it, who is never told about their own act; null for a visitor. */
  actorUserId: string | null;
  now: Date;
  channels: UnitContext["channels"];
}

export async function notifyIn(
  context: NoticeScope,
  userIds: readonly string[],
  notice: Notice,
): Promise<number> {
  const others = [...new Set(userIds)].filter(
    (userId) => userId !== context.actorUserId,
  );
  const holding = notice.collapse
    ? await holdingUnread(context.tx, {
        tenantId: context.tenantId,
        kind: notice.kind,
        subjectType: notice.subject.type,
        subjectId: notice.subject.id,
        userIds: others,
      })
    : new Set<string>();
  const targets = others.filter((userId) => !holding.has(userId));
  if (targets.length === 0) return 0;
  const rows: NewNotification[] = targets.map((userId) => ({
    userId,
    kind: notice.kind,
    subjectType: notice.subject.type,
    subjectId: notice.subject.id,
    params: notice.params,
    needsAction: notice.needsAction ?? false,
  }));
  const inserted = await insertNotifications(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    actorId: context.actorUserId,
    rows,
  });
  const channels = await channelsOf(context);
  const [people, profile] = await Promise.all([
    reachability(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      userIds: targets,
    }),
    schoolProfile(context.tx, context.schoolId),
  ]);
  const byUser = new Map(people.map((person) => [person.userId, person]));
  const school = {
    timeZone: profile?.timeZone ?? "UTC",
    weekendDays: profile?.weekendDays ?? [],
  };
  const deliveries: NewDelivery[] = inserted.flatMap((row) => {
    const person = byUser.get(row.userId);
    if (!person) return [];
    const preferences = preferencesOf(person.preferences);
    return channels.map((channel): NewDelivery => {
      const address = channel === "email" ? person.email : person.phone;
      const plan = deliveryTime({
        kind: notice.kind,
        channel,
        preferences,
        school,
        now: context.now,
        delayMinutes: notice.delayMinutes,
      });
      const base = {
        notificationId: row.id,
        notificationCreatedAt: row.createdAt,
        userId: row.userId,
        channel,
        address,
        locale: person.locale,
        dueAt: plan?.at ?? context.now,
        digest: plan?.mode === "digest",
      };
      if (!plan) return { ...base, state: "skipped", reason: "preference_off" };
      if (!address) return { ...base, state: "skipped", reason: "no_address" };
      if (!context.channels[channel])
        return { ...base, state: "skipped", reason: "no_provider" };
      return { ...base, state: "pending", reason: null };
    });
  });
  await insertDeliveries(context.tx, {
    tenantId: context.tenantId,
    rows: deliveries,
  });
  return inserted.length;
}
