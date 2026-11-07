import type { AudienceInput, Urgency } from "@faridalms/domain/announcements";
import type { BroadcastKind } from "@faridalms/domain/broadcasts";
import type { ContentDocument } from "@faridalms/domain/content";
import type { NewsVisibility } from "@faridalms/domain/news";
import type { ContentLocale } from "@faridalms/domain/translations";

import { useSuspenseQuery } from "@tanstack/react-query";

import * as m from "~/i18n/messages";
import {
  announcementEditorQuery,
  announcementOptionsQuery,
  announcementQuery,
  announcementReportQuery,
} from "~/queries/announcements";
import {
  newsEditorQuery,
  newsOptionsQuery,
  newsPostQuery,
  newsReportQuery,
} from "~/queries/news";
import {
  archiveAnnouncement,
  duplicateAnnouncement,
  getAnnouncementEditor,
  markAnnouncementSeen,
  publishAnnouncement,
  reviewAnnouncementTranslation,
  saveAnnouncement,
} from "~/server/announcements";
import {
  archiveNews,
  duplicateNews,
  getNewsEditor,
  markNewsSeen,
  publishNews,
  reviewNewsTranslation,
  saveNews,
} from "~/server/news";

export type { BroadcastKind };

export type EditorData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof announcementEditorQuery>["queryFn"]>>
>;
export type RecordData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof announcementQuery>["queryFn"]>>
>;
type NewsOptions = Awaited<
  ReturnType<NonNullable<(typeof newsOptionsQuery)["queryFn"]>>
>;
/** Who it can go to, and for news the website's categories and languages. */
export type Options = Omit<NewsOptions, "site"> & {
  site: NewsOptions["site"] | null;
};

/** Everything an author sets on a broadcast of either kind, as the editor holds it. */
export interface Draft {
  primaryLocale: ContentLocale;
  bilingual: boolean;
  titleEn: string;
  titleAr: string;
  body: ContentDocument;
  translation: ContentDocument;
  audiences: AudienceInput[];
  urgency: Urgency;
  pinnedUntil: string;
  expiresOn: string;
  requiresAck: boolean;
  ackDueOn: string;
  visibility: NewsVisibility;
  excerptEn: string;
  excerptAr: string;
  slug: string;
  categoryId: string;
  coverFileId: string;
  coverAltEn: string;
  coverAltAr: string;
  pinned: boolean;
}

interface Saved {
  id: string;
  version: number;
  translationReview: EditorData["translationReview"];
}

/** How one replaces the copy already out: told again, or quietly. */
export type Revision = "first" | "quietly" | "telling";

/**
 * What the screens of one kind of broadcast differ in: their addresses,
 * their API, and the words they use. An announcement reaches its audience
 * and can ask for acknowledgement; a news post can also be on the website.
 */
export interface KindView {
  kind: BroadcastKind;
  capability: "announcements:manage" | "news:manage";
  /** The query cache every screen of the kind reads under. */
  queryKey: "announcements" | "news";
  /** Where its words' ids start, so its editors and fields are found by kind. */
  prefix: "announcement" | "news";
  /** A news post may go only to the website, with nobody told. */
  audienceOptional: boolean;
  recordPath: (id: string) => string;
  useEditor: (id: string) => EditorData;
  /** The editor's data as stored now, read past the cache. */
  loadEditor: (id: string) => Promise<EditorData>;
  useRecord: (id: string) => RecordData;
  reportQuery: typeof announcementReportQuery;
  useOptions: () => Options;
  save: (draft: Draft, id: string, version: number) => Promise<Saved>;
  publish: (input: {
    id: string;
    expectedVersion: number;
    publishAt: string;
    revision: Revision;
  }) => Promise<{ version: number }>;
  archive: (id: string, version: number) => Promise<unknown>;
  review: (
    id: string,
    version: number,
    reviewed: boolean,
  ) => Promise<{ version: number; review: EditorData["translationReview"] }>;
  duplicate: (id: string) => Promise<{ id: string }>;
  seen: (id: string, acknowledge: boolean) => Promise<unknown>;
  copy: {
    breadcrumb: () => string;
    newTitle: () => string;
    editTitle: () => string;
    untitled: () => string;
    titleNeeded: () => string;
    bodyNeeded: () => string;
    published: () => string;
    scheduled: () => string;
    revised: () => string;
    archived: () => string;
    duplicate: () => string;
    duplicated: () => string;
    reportHint: () => string;
    notSent: () => string;
    /** What replacing the copy already out is called. */
    revise: () => string;
  };
}

const optionsOf = (draft: Draft, id: string, version: number) => ({
  id,
  expectedVersion: version,
  primaryLocale: draft.primaryLocale,
  titleEn: draft.titleEn.trim(),
  titleAr: draft.titleAr.trim(),
  body: draft.body,
  translation: draft.bilingual ? draft.translation : null,
  audiences: draft.audiences,
});

const announcement: KindView = {
  kind: "announcement",
  capability: "announcements:manage",
  queryKey: "announcements",
  prefix: "announcement",
  audienceOptional: false,
  recordPath: (id) => `/announcements/${id}`,
  useEditor: (id) => useSuspenseQuery(announcementEditorQuery(id)).data,
  loadEditor: (id) => getAnnouncementEditor({ data: { id } }),
  useRecord: (id) => useSuspenseQuery(announcementQuery(id)).data,
  reportQuery: announcementReportQuery,
  useOptions: () => {
    const choices = useSuspenseQuery(announcementOptionsQuery).data;
    return { ...choices, categories: [], site: null };
  },
  save: (draft, id, version) =>
    saveAnnouncement({
      data: {
        ...optionsOf(draft, id, version),
        urgency: draft.urgency,
        pinnedUntil: draft.pinnedUntil,
        expiresOn: draft.expiresOn,
        requiresAck: draft.requiresAck,
        ackDueOn: draft.requiresAck ? draft.ackDueOn : "",
      },
    }),
  publish: ({ id, expectedVersion, publishAt, revision }) =>
    publishAnnouncement({
      data: {
        id,
        expectedVersion,
        publishAt,
        sendUpdate: revision !== "first",
        quietly: revision === "quietly",
      },
    }),
  archive: (id, version) =>
    archiveAnnouncement({ data: { id, expectedVersion: version } }),
  review: (id, version, reviewed) =>
    reviewAnnouncementTranslation({
      data: { id, expectedVersion: version, reviewed },
    }),
  duplicate: (id) => duplicateAnnouncement({ data: { id } }),
  seen: (id, acknowledge) =>
    markAnnouncementSeen({ data: { id, acknowledge } }),
  copy: {
    breadcrumb: m.annEditorBreadcrumb,
    newTitle: m.annNewTitle,
    editTitle: m.annEditTitle,
    untitled: m.annUntitled,
    titleNeeded: m.annTitleNeeded,
    bodyNeeded: m.annBodyNeeded,
    published: m.annPublished,
    scheduled: m.annScheduled,
    revised: m.annUpdateSent,
    archived: m.annArchived,
    duplicate: m.annDuplicate,
    duplicated: m.annDuplicated,
    reportHint: m.annReportHint,
    notSent: m.annNotSent,
    revise: m.annSendUpdate,
  },
};

const news: KindView = {
  kind: "news",
  capability: "news:manage",
  queryKey: "news",
  prefix: "news",
  audienceOptional: true,
  recordPath: (id) => `/news/${id}`,
  useEditor: (id) => useSuspenseQuery(newsEditorQuery(id)).data,
  loadEditor: (id) => getNewsEditor({ data: { id } }),
  useRecord: (id) => useSuspenseQuery(newsPostQuery(id)).data,
  reportQuery: newsReportQuery,
  useOptions: () => useSuspenseQuery(newsOptionsQuery).data,
  save: (draft, id, version) =>
    saveNews({
      data: {
        ...optionsOf(draft, id, version),
        visibility: draft.visibility,
        excerptEn: draft.excerptEn.trim(),
        excerptAr: draft.excerptAr.trim(),
        slug: draft.slug,
        categoryId: draft.categoryId,
        coverFileId: draft.coverFileId,
        coverAltEn: draft.coverAltEn.trim(),
        coverAltAr: draft.coverAltAr.trim(),
        pinned: draft.pinned,
      },
    }),
  publish: ({ id, expectedVersion, publishAt }) =>
    publishNews({ data: { id, expectedVersion, publishAt } }),
  archive: (id, version) =>
    archiveNews({ data: { id, expectedVersion: version } }),
  review: (id, version, reviewed) =>
    reviewNewsTranslation({ data: { id, expectedVersion: version, reviewed } }),
  duplicate: (id) => duplicateNews({ data: { id } }),
  seen: (id) => markNewsSeen({ data: { id } }),
  copy: {
    breadcrumb: m.newsEditorBreadcrumb,
    newTitle: m.newsNewTitle,
    editTitle: m.newsEditTitle,
    untitled: m.newsUntitled,
    titleNeeded: m.newsTitleNeeded,
    bodyNeeded: m.newsBodyNeeded,
    published: m.newsPublished,
    scheduled: m.newsScheduled,
    revised: m.newsChangesPublished,
    archived: m.newsArchived,
    duplicate: m.newsDuplicate,
    duplicated: m.newsDuplicated,
    reportHint: m.newsReportHint,
    notSent: m.newsNotSent,
    revise: m.newsPublishChanges,
  },
};

export const KINDS: Record<BroadcastKind, KindView> = { announcement, news };
