import type { ManageNewsQuery } from "@faridalms/domain/news";

import { queryOptions } from "@tanstack/react-query";

import {
  getManagedNews,
  getNews,
  getNewsEditor,
  getNewsOptions,
  getNewsPost,
} from "~/server/news";

export const newsQuery = (q: string) =>
  queryOptions({
    queryKey: ["news", "list", q],
    queryFn: () => getNews({ data: { q } }),
    placeholderData: (previous) => previous,
  });

export const managedNewsQuery = (query: ManageNewsQuery) =>
  queryOptions({
    queryKey: ["news", "manage", query],
    queryFn: () => getManagedNews({ data: query }),
    placeholderData: (previous) => previous,
  });

export const newsOptionsQuery = queryOptions({
  queryKey: ["news", "options"],
  queryFn: () => getNewsOptions(),
});

export const newsEditorQuery = (id: string) =>
  queryOptions({
    queryKey: ["news", "editor", id],
    queryFn: () => getNewsEditor({ data: { id } }),
  });

export const newsPostQuery = (id: string) =>
  queryOptions({
    queryKey: ["news", "record", id],
    queryFn: () => getNewsPost({ data: { id } }),
  });
