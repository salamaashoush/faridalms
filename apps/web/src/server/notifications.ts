import {
  deliveryLogSchema,
  listNotificationsSchema,
  markReadSchema,
  savePreferencesSchema,
} from "@faridalms/domain/notifications";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";
import { checked } from "./input";

export const getNotifications = createServerFn({ method: "GET" })
  .validator(checked(listNotificationsSchema))
  .handler(({ data }) => backend().notifications.list(data));

export const getRecentNotifications = createServerFn({
  method: "GET",
}).handler(() => backend().notifications.recent());

export const markNotificationsRead = createServerFn({ method: "POST" })
  .validator(checked(markReadSchema))
  .handler(({ data }) => backend().notifications.markRead(data));

export const getNotificationPreferences = createServerFn({
  method: "GET",
}).handler(() => backend().notifications.preferences());

export const saveNotificationPreferences = createServerFn({ method: "POST" })
  .validator(checked(savePreferencesSchema))
  .handler(({ data }) => backend().notifications.savePreferences(data));

export const getDeliveryLog = createServerFn({ method: "GET" })
  .validator(checked(deliveryLogSchema))
  .handler(({ data }) => backend().notifications.deliveries(data));
