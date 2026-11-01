import type { ManageQuery } from "@faridalms/domain/announcements";

import { MANAGE_TABS } from "@faridalms/domain/announcements";
import { cn } from "@faridalms/ui/cn";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { CircleCheck, Megaphone, Pin, Plus } from "lucide-react";
import * as v from "valibot";

import type { Column } from "~/components/system/DataTable";

import { URGENCY_LABEL, URGENCY_TONE } from "~/components/announcements/format";
import { DataTable, RowLink } from "~/components/system/DataTable";
import {
  EmptyState,
  IndexToolbar,
  PageHeader,
} from "~/components/system/IndexPage";
import { RecordTabs } from "~/components/system/RecordPage";
import { StatusBadge, StatusText } from "~/components/system/status";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  announcementFeedQuery,
  managedAnnouncementsQuery,
} from "~/queries/announcements";
import { formatInstant, formatDate, formatNumber } from "~/utils/datetime";

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

type FeedRow = Awaited<
  ReturnType<NonNullable<ReturnType<typeof announcementFeedQuery>["queryFn"]>>
>["rows"][number];
type ManagedRow = Awaited<
  ReturnType<
    NonNullable<ReturnType<typeof managedAnnouncementsQuery>["queryFn"]>
  >
>["rows"][number];

function FeedItem({ row }: { row: FeedRow }) {
  const unread = row.readAt === null;
  return (
    <li className="grid gap-1.5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {row.pinned ? (
          <Pin
            className="size-4 text-muted-foreground"
            aria-label={m.annPinned()}
          />
        ) : null}
        <Link
          to="/announcements/$announcementId"
          params={{ announcementId: row.id }}
          className={cn(
            "min-w-0 text-base leading-6 hover:text-primary hover:underline",
            unread ? "font-semibold" : "font-medium",
          )}
        >
          <bdi>{row.title}</bdi>
        </Link>
        {row.urgency === "normal" ? null : (
          <StatusBadge tone={URGENCY_TONE[row.urgency]}>
            {URGENCY_LABEL[row.urgency]()}
          </StatusBadge>
        )}
        {unread ? <span className="sr-only">{m.annUnread()}</span> : null}
      </div>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {[
          inLocale(row.authorNameEn, row.authorNameAr),
          row.publishAt ? formatInstant(row.publishAt) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {row.summary ? (
        <p
          dir="auto"
          className="line-clamp-2 text-sm leading-5 text-foreground/90"
        >
          {row.summary}
        </p>
      ) : null}
      {row.requiresAck ? (
        row.acknowledgedAt ? (
          <StatusText tone="success">{m.annAcknowledged()}</StatusText>
        ) : (
          <StatusText tone="warning">
            {row.ackDueOn
              ? m.annAckDue({ date: formatDate(row.ackDueOn) })
              : m.annAckNeeded()}
          </StatusText>
        )
      ) : null}
    </li>
  );
}

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
        <FeedItem key={row.id} row={row} />
      ))}
    </ul>
  );
}

function ManagedTitle({ row }: { row: ManagedRow }) {
  return row.state === "draft" ? (
    <RowLink to="/admin/announcement-editor" search={{ id: row.id }}>
      {row.title}
    </RowLink>
  ) : (
    <RowLink
      to="/announcements/$announcementId"
      params={{ announcementId: row.id }}
    >
      {row.title}
    </RowLink>
  );
}

function reach(row: ManagedRow) {
  if (row.recipients === 0) return "–";
  const read = m.annReadOf({
    count: formatNumber(row.read),
    total: formatNumber(row.recipients),
  });
  return row.requiresAck
    ? `${read} · ${m.annAckOf({ count: formatNumber(row.acknowledged) })}`
    : read;
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function managedColumns(): Column<ManagedRow>[] {
  return [
    {
      id: "title",
      header: m.annColTitle(),
      primary: true,
      cell: (row) => <ManagedTitle row={row} />,
    },
    {
      id: "urgency",
      header: m.annColUrgency(),
      cell: (row) => (
        <StatusText tone={URGENCY_TONE[row.urgency]}>
          {URGENCY_LABEL[row.urgency]()}
        </StatusText>
      ),
    },
    {
      id: "when",
      header: m.annColWhen(),
      cell: (row) => (row.publishAt ? formatInstant(row.publishAt) : "–"),
    },
    { id: "reach", header: m.annColReach(), cell: (row) => reach(row) },
  ];
}

const managedCard = {
  title: (row: ManagedRow) => <ManagedTitle row={row} />,
  fact: (row: ManagedRow) => reach(row),
};

function Managed({ tab, q }: { tab: ManageQuery["tab"]; q: string }) {
  const { rows } = useSuspenseQuery(managedAnnouncementsQuery({ tab, q })).data;
  return (
    <DataTable
      caption={m.annManagedCaption()}
      rows={rows}
      columns={managedColumns()}
      rowLabel={(row) => row.title}
      card={managedCard}
      empty={{
        icon: CircleCheck,
        title: m.annManagedEmpty(),
        description: m.annManagedEmptyBody(),
      }}
    />
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
            <Managed tab={search.tab} q={search.q} />
          ) : (
            <Feed tab={search.tab} q={search.q} />
          )}
        </div>
      </RecordTabs>
    </>
  );
}
