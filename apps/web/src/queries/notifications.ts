import type { DeliveryLogQuery } from "@faridalms/domain/notifications";

import { queryOptions } from "@tanstack/react-query";

import {
  getDeliveryLog,
  getNotificationPreferences,
  getNotifications,
  getRecentNotifications,
} from "~/server/notifications";

export const recentNotificationsQuery = queryOptions({
  queryKey: ["notifications", "recent"],
  queryFn: () => getRecentNotifications(),
  refetchInterval: 60_000,
});

export const notificationsQuery = (tab: "action" | "all", page: number) =>
  queryOptions({
    queryKey: ["notifications", "list", tab, page],
    queryFn: () => getNotifications({ data: { tab, page } }),
    placeholderData: (previous) => previous,
  });

export const notificationPreferencesQuery = queryOptions({
  queryKey: ["notifications", "preferences"],
  queryFn: () => getNotificationPreferences(),
});

export const deliveryLogQuery = (query: DeliveryLogQuery) =>
  queryOptions({
    queryKey: ["notifications", "deliveries", query],
    queryFn: () => getDeliveryLog({ data: query }),
    placeholderData: (previous) => previous,
  });
