import { queryOptions } from "@tanstack/react-query";

import { collaborate } from "~/server/documents";

export interface DocumentHost {
  hostType: string;
  hostId: string;
}

/**
 * The ticket to a record's live document, fetched with the page that edits
 * it so the editor can join the moment it loads.
 */
export const collaborationQuery = (host: DocumentHost | null) =>
  queryOptions({
    queryKey: ["collaborate", host?.hostType, host?.hostId],
    queryFn: () => (host ? collaborate({ data: host }) : null),
    enabled: host !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
