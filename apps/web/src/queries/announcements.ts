import type {
  FeedQuery,
  ManageQuery,
  ReportQuery,
} from "@faridalms/domain/announcements";

import { queryOptions } from "@tanstack/react-query";

import {
  getAnnouncement,
  getAnnouncementEditor,
  getAnnouncementFeed,
  getAnnouncementOptions,
  getAnnouncementReport,
  getManagedAnnouncements,
} from "~/server/announcements";

export const announcementFeedQuery = (query: FeedQuery) =>
  queryOptions({
    queryKey: ["announcements", "feed", query],
    queryFn: () => getAnnouncementFeed({ data: query }),
    placeholderData: (previous) => previous,
  });

export const managedAnnouncementsQuery = (query: ManageQuery) =>
  queryOptions({
    queryKey: ["announcements", "manage", query],
    queryFn: () => getManagedAnnouncements({ data: query }),
    placeholderData: (previous) => previous,
  });

export const announcementOptionsQuery = queryOptions({
  queryKey: ["announcements", "options"],
  queryFn: () => getAnnouncementOptions(),
});

export const announcementEditorQuery = (id: string) =>
  queryOptions({
    queryKey: ["announcements", "editor", id],
    queryFn: () => getAnnouncementEditor({ data: { id } }),
  });

export const announcementQuery = (id: string) =>
  queryOptions({
    queryKey: ["announcements", "record", id],
    queryFn: () => getAnnouncement({ data: { id } }),
  });

export const announcementReportQuery = (query: ReportQuery) =>
  queryOptions({
    queryKey: ["announcements", "report", query],
    queryFn: () => getAnnouncementReport({ data: query }),
    placeholderData: (previous) => previous,
  });
