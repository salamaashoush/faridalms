import type { ManageQuery } from "@faridalms/domain/announcements";

import { MANAGE_TABS } from "@faridalms/domain/announcements";
import { pageField } from "@faridalms/domain/paging";
import { Pagination } from "@faridalms/ui/system/data-table";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Megaphone, Plus } from "lucide-react";
import * as v from "valibot";

import {
  BroadcastItem,
  ManagedBroadcasts,
} from "~/components/broadcasts/BroadcastLists";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  announcementFeedQuery,
  managedAnnouncementsQuery,
} from "~/queries/announcements";

const TABS = ["current", "past", ...MANAGE_TABS] as const;
type Tab = (typeof TABS)[number];

const searchSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(TABS), "current"), "current"),
  q: v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
  page: v.fallback(pageField, 1),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

const isManage = (tab: Tab): tab is ManageQuery["tab"] =>
  (MANAGE_TABS as readonly string[]).includes(tab);

export const Route = createFileRoute("/_app/announcements/")({
  staticData: { breadcrumb: m.annTitle },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const { queryClient } = context;
    if (isManage(deps.tab))
      await queryClient.ensureQueryData(
        managedAnnouncementsQuery({
          tab: deps.tab,
          q: deps.q,
          page: deps.page,
        }),
      );
    else
      await queryClient.ensureQueryData(
        announcementFeedQuery({ tab: deps.tab, q: deps.q, page: deps.page }),
      );
  },
  component: AnnouncementsPage,
});

const TAB_LABEL: Record<Tab, () => string> = {
  current: m.annTabCurrent,
  past: m.annTabPast,
  drafts: m.annTabDrafts,
  scheduled: m.annTabScheduled,
  published: m.annTabSent,
  archived: m.annTabArchived,
};

interface FeedProps {
  tab: "current" | "past";
  q: string;
  page: number;
  onPage: (page: number) => void;
}

function Feed({ tab, q, page, onPage }: FeedProps) {
  const data = useSuspenseQuery(announcementFeedQuery({ tab, q, page })).data;
  const { rows } = data;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={Megaphone}
        title={tab === "past" ? m.annNoPast() : m.annNothing()}
        description={m.annNothingBody()}
      />
    );
  return (
    <div className="grid gap-4">
      <ul
        className="divide-y rounded-lg border bg-card px-5"
        aria-label={m.annTitle()}
      >
        {rows.map((row) => (
          <BroadcastItem
            key={row.id}
            kind="announcement"
            item={{
              id: row.id,
              title: row.title,
              unread: row.readAt === null,
              pinned: row.pinned,
              urgency: row.urgency,
              author: inLocale(row.authorNameEn, row.authorNameAr),
              when: row.publishAt,
              website: false,
              summary: row.summary,
              ack: row.requiresAck
                ? { acknowledgedAt: row.acknowledgedAt, ackDueOn: row.ackDueOn }
                : null,
            }}
          />
        ))}
      </ul>
      {data.pages > 1 ? (
        <Pagination
          page={data.page}
          pages={data.pages}
          total={data.total}
          pageSize={data.pageSize}
          onPage={onPage}
        />
      ) : null}
    </div>
  );
}

function AnnouncementsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const manages = user.capabilities.includes("announcements:manage");
  const tabs = TABS.filter((tab) => manages || !isManage(tab));
  const onPage = (page: number) =>
    void navigate({ search: (previous) => ({ ...previous, page }) });
  return (
    <Page width="list">
      <PageHeader
        title={m.annTitle()}
        description={m.annHint()}
        action={
          manages
            ? {
                label: m.annNew(),
                icon: Plus,
                link: { to: "/announcement-editor", search: {} },
              }
            : undefined
        }
      />
      <RecordTabs
        label={m.annTitle()}
        tabs={tabs.map((value) => ({ value, label: TAB_LABEL[value]() }))}
        value={search.tab}
        onChange={(tab) =>
          void navigate({ resetScroll: false, replace: true, search: { tab } })
        }
      >
        <div className="grid gap-4">
          <IndexToolbar
            search={{
              value: search.q,
              onChange: (q) =>
                void navigate({
                  search: (previous) => ({ ...previous, q, page: 1 }),
                }),
              label: m.annSearch(),
              placeholder: m.annSearchPlaceholder(),
            }}
          />
          {isManage(search.tab) ? (
            <ManagedBroadcasts
              kind="announcement"
              tab={search.tab}
              q={search.q}
              page={search.page}
              onPage={onPage}
            />
          ) : (
            <Feed
              tab={search.tab}
              q={search.q}
              page={search.page}
              onPage={onPage}
            />
          )}
        </div>
      </RecordTabs>
    </Page>
  );
}
