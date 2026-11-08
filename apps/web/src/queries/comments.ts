import { queryOptions, skipToken } from "@tanstack/react-query";

import type { DocumentHost } from "~/queries/documents";

import { getCommentThreads } from "~/server/comments";

/** Colleagues comment while the page is open, so the threads are asked for again now and then. */
const REFRESH_MS = 30_000;

/** A document's threads; none are asked for while it has no stored record. */
export const commentThreadsQuery = (host: DocumentHost | undefined) =>
  queryOptions({
    queryKey: ["comments", host?.hostType ?? "", host?.hostId ?? ""],
    queryFn: host ? () => getCommentThreads({ data: host }) : skipToken,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  });

export type CommentThread = Awaited<
  ReturnType<typeof getCommentThreads>
>[number];
