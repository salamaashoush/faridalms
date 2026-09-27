import type { InboxQuery } from "@faridalms/domain/messages";

import { queryOptions } from "@tanstack/react-query";

import {
  getInbox,
  getRecipients,
  getThread,
  getUnreadThreads,
} from "~/server/messages";

export const inboxQuery = (query: InboxQuery) =>
  queryOptions({
    queryKey: ["messages", "inbox", query],
    queryFn: () => getInbox({ data: query }),
    placeholderData: (previous) => previous,
  });

export const unreadThreadsQuery = queryOptions({
  queryKey: ["messages", "unread"],
  queryFn: () => getUnreadThreads(),
});

export const threadQuery = (id: string) =>
  queryOptions({
    queryKey: ["messages", "thread", id],
    queryFn: () => getThread({ data: { id } }),
  });

export const messageRecipientsQuery = (q: string) =>
  queryOptions({
    queryKey: ["messages", "recipients", q],
    queryFn: () => getRecipients({ data: { q } }),
    placeholderData: (previous) => previous,
  });
