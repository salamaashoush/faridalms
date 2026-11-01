import type { ManageQuery } from "@faridalms/domain/announcements";

import { MANAGE_TABS } from "@faridalms/domain/announcements";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Megaphone, Plus } from "lucide-react";
import * as v from "valibot";

import {
  BroadcastItem,
  ManagedBroadcasts,
} from "~/components/broadcasts/BroadcastLists";
import {
  EmptyState,
  IndexToolbar,
  PageHeader,
} from "~/components/system/IndexPage";
import { RecordTabs } from "~/components/system/RecordPage";
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
        managedAnnouncementsQuery({ tab: deps.tab, q: deps.q }),
      );
    else
      await queryClient.ensureQueryData(
        announcementFeedQuery({ tab: deps.tab, q: deps.q }),
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

function Feed({ tab, q }: { tab: "current" | "past"; q: string }) {
  const { rows } = useSuspenseQuery(announcementFeedQuery({ tab, q })).data;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={Megaphone}
        title={tab === "past" ? m.annNoPast() : m.annNothing()}
        description={m.annNothingBody()}
      />
    );
  return (
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
  );
}

function AnnouncementsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const manages = user.capabilities.includes("announcements:manage");
  const tabs = TABS.filter((tab) => manages || !isManage(tab));
  return (
    <>
      <PageHeader
        title={m.annTitle()}
        description={m.annHint()}
        action={
          manages
            ? {
                label: m.annNew(),
                icon: Plus,
                link: { to: "/admin/announcement-editor", search: {} },
              }
            : undefined
        }
      />
      <RecordTabs
        label={m.annTitle()}
        tabs={tabs.map((value) => ({ value, label: TAB_LABEL[value]() }))}
        value={search.tab}
        onChange={(tab) => void navigate({ search: { tab } })}
      >
        <div className="grid gap-4">
          <IndexToolbar
            search={{
              value: search.q,
              onChange: (q) =>
                void navigate({ search: (previous) => ({ ...previous, q }) }),
              label: m.annSearch(),
              placeholder: m.annSearchPlaceholder(),
            }}
          />
          {isManage(search.tab) ? (
            <ManagedBroadcasts
              kind="announcement"
              tab={search.tab}
              q={search.q}
            />
          ) : (
            <Feed tab={search.tab} q={search.q} />
          )}
        </div>
      </RecordTabs>
    </>
  );
}
