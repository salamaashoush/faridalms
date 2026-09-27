import {
  deliveryAuditQuerySchema,
  markNotificationsReadSchema,
  notificationsQuerySchema,
  saveNotificationPreferencesSchema,
} from "@faridalms/domain/notification";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";

export const getNotifications = createServerFn({ method: "GET" })
  .inputValidator(notificationsQuerySchema)
  .handler(({ data }) => backend().getNotifications(data));
export const getUnreadNotificationCount = createServerFn({
  method: "GET",
}).handler(() => backend().getUnreadNotificationCount());
export const markNotificationsRead = createServerFn({ method: "POST" })
  .inputValidator(markNotificationsReadSchema)
  .handler(({ data }) => backend().markNotificationsRead(data));
export const getNotificationPreferences = createServerFn({
  method: "GET",
}).handler(() => backend().getNotificationPreferences());
export const saveNotificationPreferences = createServerFn({ method: "POST" })
  .inputValidator(saveNotificationPreferencesSchema)
  .handler(({ data }) => backend().saveNotificationPreferences(data));
export const getNotificationAudit = createServerFn({ method: "GET" })
  .inputValidator(deliveryAuditQuerySchema)
  .handler(({ data }) => backend().getNotificationAudit(data));
