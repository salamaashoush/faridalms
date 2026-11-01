import type {
  InboxQuery,
  Keyset,
  RecipientCursor,
} from "@faridalms/domain/messages";

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import {
  getDraft,
  getDrafts,
  getInbox,
  getRecipients,
  getThread,
  getUnreadThreads,
} from "~/server/messages";

export const inboxQuery = (query: InboxQuery) =>
  infiniteQueryOptions({
    queryKey: ["messages", "inbox", query],
    queryFn: ({ pageParam }) =>
      getInbox({ data: { ...query, after: pageParam } }),
    initialPageParam: null as Keyset | null,
    getNextPageParam: (last) => last.next ?? undefined,
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

/** A conversation further back than its latest entries, from the oldest one shown. */
export const earlierEntriesQuery = (id: string, before: string) =>
  infiniteQueryOptions({
    queryKey: ["messages", "thread", id, "earlier", before],
    queryFn: ({ pageParam }) => getThread({ data: { id, before: pageParam } }),
    initialPageParam: before,
    getNextPageParam: (last) =>
      last.hasMore ? last.messages[0]?.id : undefined,
  });

export const messageRecipientsQuery = (
  q: string,
  among: "all" | "people" | "students" = "all",
) =>
  infiniteQueryOptions({
    queryKey: ["messages", "recipients", q, among],
    queryFn: ({ pageParam }) =>
      getRecipients({ data: { q, among, after: pageParam } }),
    initialPageParam: null as RecipientCursor | null,
    getNextPageParam: (last) => last.next ?? undefined,
    placeholderData: (previous) => previous,
  });

export const draftsQuery = infiniteQueryOptions({
  queryKey: ["messages", "drafts"],
  queryFn: ({ pageParam }) => getDrafts({ data: { after: pageParam } }),
  initialPageParam: null as Keyset | null,
  getNextPageParam: (last) => last.next ?? undefined,
});

export const draftQuery = (id: string) =>
  queryOptions({
    queryKey: ["messages", "draft", id],
    queryFn: () => getDraft({ data: { id } }),
  });
