import { queryOptions } from "@tanstack/react-query";

import {
  getNewsletter,
  getNotificationAudit,
  getNotificationPreferences,
  getNotifications,
  getUnreadNotificationCount,
} from "~/server/notifications";

export const unreadNotificationsQuery = queryOptions({
  queryKey: ["notifications", "unread"],
  queryFn: () => getUnreadNotificationCount(),
  refetchInterval: 30_000,
});
export const notificationsQuery = (page: number, unreadOnly: boolean) =>
  queryOptions({
    queryKey: ["notifications", "list", page, unreadOnly],
    queryFn: () => getNotifications({ data: { page, unreadOnly } }),
  });
export const notificationPreferencesQuery = queryOptions({
  queryKey: ["notifications", "preferences"],
  queryFn: () => getNotificationPreferences(),
});
export const notificationAuditQuery = (query: {
  page: number;
  q: string;
  state: "all" | "pending" | "sent" | "failed" | "skipped";
  channel: "all" | "in_app" | "email" | "sms";
}) =>
  queryOptions({
    queryKey: ["notifications", "audit", query],
    queryFn: () => getNotificationAudit({ data: query }),
  });
export const newsletterQuery = (id: string) =>
  queryOptions({
    queryKey: ["newsletters", "edition", id],
    queryFn: () => getNewsletter({ data: { id } }),
  });
