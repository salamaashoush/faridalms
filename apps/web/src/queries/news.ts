import type { ReportQuery } from "@faridalms/domain/broadcasts";
import type { ManageNewsQuery, NewsListQuery } from "@faridalms/domain/news";

import { queryOptions } from "@tanstack/react-query";

import {
  getManagedNews,
  getNews,
  getNewsEditor,
  getNewsOptions,
  getNewsPost,
  getNewsReport,
} from "~/server/news";

export const newsQuery = (query: NewsListQuery) =>
  queryOptions({
    queryKey: ["news", "list", query],
    queryFn: () => getNews({ data: query }),
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

export const newsReportQuery = (query: ReportQuery) =>
  queryOptions({
    queryKey: ["news", "report", query],
    queryFn: () => getNewsReport({ data: query }),
    placeholderData: (previous) => previous,
  });
