import {
  deliveryAudit,
  getNotificationPreferences as readPreferences,
  listNotifications,
  markNotificationsRead as markRead,
  saveNotificationPreferences as savePreferences,
  unreadNotificationCount,
} from "@faridalms/database/repositories/notifications";
import {
  deliveryAuditQuerySchema,
  markNotificationsReadSchema,
  notificationsQuerySchema,
  saveNotificationPreferencesSchema,
} from "@faridalms/domain/notification";

import { requirePermission } from "../authorization";
import { notificationPath } from "../notifications/templates";
import { protectedProcedure } from "../procedure";

export const getNotifications = protectedProcedure
  .input(notificationsQuerySchema)
  .handler(async ({ input, context }) => {
    const [directory, unread] = await Promise.all([
      listNotifications(
        context.db,
        context.user.id,
        input.page,
        input.unreadOnly,
      ),
      unreadNotificationCount(context.db, context.user.id),
    ]);
    return {
      ...directory,
      unread,
      rows: directory.rows.map((row) => ({
        ...row,
        path: notificationPath(row.payload, context.user.role),
      })),
    };
  });

export const getUnreadNotificationCount = protectedProcedure.handler(
  async ({ context }) => ({
    unread: await unreadNotificationCount(context.db, context.user.id),
  }),
);

export const markNotificationsRead = protectedProcedure
  .input(markNotificationsReadSchema)
  .handler(async ({ input, context }) => {
    await markRead(context.db, context.user.id, input.ids);
    return {
      unread: await unreadNotificationCount(context.db, context.user.id),
    };
  });

export const getNotificationPreferences = protectedProcedure.handler(
  ({ context }) => readPreferences(context.db, context.user.id),
);

export const saveNotificationPreferences = protectedProcedure
  .input(saveNotificationPreferencesSchema)
  .handler(({ input, context }) =>
    savePreferences(context.db, context.user.id, input),
  );

/** What was attempted on every channel, for the school's administrators. */
export const getNotificationAudit = protectedProcedure
  .input(deliveryAuditQuerySchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "school:manage");
    return deliveryAudit(context.db, input);
  });
