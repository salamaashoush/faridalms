import { queryOptions } from "@tanstack/react-query";

import type { DocumentHost } from "~/queries/documents";

import { getCommentThreads } from "~/server/comments";

/** Colleagues comment while the page is open, so the threads are asked for again now and then. */
const REFRESH_MS = 30_000;

export const commentThreadsQuery = (host: DocumentHost) =>
  queryOptions({
    queryKey: ["comments", host.hostType, host.hostId],
    queryFn: () => getCommentThreads({ data: host }),
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  });

export type CommentThread = Awaited<
  ReturnType<typeof getCommentThreads>
>[number];
