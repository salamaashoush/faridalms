import { queryOptions } from "@tanstack/react-query";

import { getMessageDraft, getMessageDrafts } from "~/server/message-drafts";

export const messageDraftQuery = (id: string) =>
  queryOptions({
    queryKey: ["message-drafts", "detail", id],
    queryFn: () => getMessageDraft({ data: { id } }),
  });
export const messageDraftsQuery = (page: number) =>
  queryOptions({
    queryKey: ["message-drafts", "list", page],
    queryFn: () => getMessageDrafts({ data: { page } }),
  });
