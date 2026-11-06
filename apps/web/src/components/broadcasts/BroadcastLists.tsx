import type { Urgency } from "@faridalms/domain/announcements";
import type { Column } from "@faridalms/ui/system/data-table";

import { cn } from "@faridalms/ui/cn";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleCheck, Pin } from "lucide-react";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { managedAnnouncementsQuery } from "~/queries/announcements";
import { managedNewsQuery } from "~/queries/news";
import { formatDate, formatInstant, formatNumber } from "~/utils/datetime";

import type { BroadcastKind } from "./kinds";

import { URGENCY_LABEL, URGENCY_TONE } from "./format";

type ManagedRow = Awaited<
  ReturnType<
    NonNullable<ReturnType<typeof managedAnnouncementsQuery>["queryFn"]>
  >
>["rows"][number];

type ManageTab = "drafts" | "scheduled" | "published" | "archived";

const titleOf = (row: { titleEn: string; titleAr: string }) =>
  inLocale(row.titleEn || null, row.titleAr || null);

interface BroadcastLinkProps {
  kind: BroadcastKind;
  id: string;
  className: string;
  children: React.ReactNode;
}

function BroadcastLink({ kind, id, className, children }: BroadcastLinkProps) {
  return kind === "announcement" ? (
    <Link
      to="/announcements/$announcementId"
      params={{ announcementId: id }}
      className={className}
    >
      {children}
    </Link>
  ) : (
    <Link to="/news/$postId" params={{ postId: id }} className={className}>
      {children}
    </Link>
  );
}

export interface BroadcastItemProps {
  kind: BroadcastKind;
  item: {
    id: string;
    title: string;
    unread: boolean;
    pinned: boolean;
    urgency: Urgency;
    author: string;
    when: string | null;
    website: boolean;
    summary: string;
    /** For one that asks to be acknowledged, whether this reader has. */
    ack: { acknowledgedAt: string | null; ackDueOn: string | null } | null;
  };
}

/** One broadcast as its readers' list shows it, of either kind. */
export function BroadcastItem({ kind, item }: BroadcastItemProps) {
  return (
    <li className="grid gap-1.5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {item.pinned ? (
          <Pin
            className="size-4 text-muted-foreground"
            aria-label={m.annPinned()}
          />
        ) : null}
        <BroadcastLink
          kind={kind}
          id={item.id}
          className={cn(
            "min-w-0 text-base leading-6 hover:text-primary hover:underline",
            item.unread ? "font-semibold" : "font-medium",
          )}
        >
          <bdi>{item.title}</bdi>
          {item.unread ? (
            <span className="sr-only"> {m.annUnread()}</span>
          ) : null}
        </BroadcastLink>
        {item.urgency === "normal" ? null : (
          <StatusBadge tone={URGENCY_TONE[item.urgency]}>
            {URGENCY_LABEL[item.urgency]()}
          </StatusBadge>
        )}
      </div>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {[
          item.author,
          item.when ? formatInstant(item.when) : null,
          item.website ? m.newsWebsite() : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {item.summary ? (
        <p
          dir="auto"
          className="line-clamp-2 text-sm leading-5 text-foreground/90"
        >
          {item.summary.replaceAll(/\s*\n+\s*/g, " · ")}
        </p>
      ) : null}
      {item.ack ? (
        item.ack.acknowledgedAt ? (
          <StatusText tone="success">{m.annAcknowledged()}</StatusText>
        ) : (
          <StatusText tone="warning">
            {item.ack.ackDueOn
              ? m.annAckDue({ date: formatDate(item.ack.ackDueOn) })
              : m.annAckNeeded()}
          </StatusText>
        )
      ) : null}
    </li>
  );
}

interface ManagedTitleProps {
  kind: BroadcastKind;
  row: ManagedRow;
}

function ManagedTitle({ kind, row }: ManagedTitleProps) {
  const title = titleOf(row);
  if (row.state !== "draft")
    return kind === "announcement" ? (
      <RowLink
        to="/announcements/$announcementId"
        params={{ announcementId: row.id }}
      >
        {title}
      </RowLink>
    ) : (
      <RowLink to="/news/$postId" params={{ postId: row.id }}>
        {title}
      </RowLink>
    );
  return kind === "announcement" ? (
    <RowLink to="/admin/announcement-editor" search={{ id: row.id }}>
      {title}
    </RowLink>
  ) : (
    <RowLink to="/news-editor" search={{ id: row.id }}>
      {title}
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
function managedColumns(kind: BroadcastKind): Column<ManagedRow>[] {
  return [
    {
      id: "title",
      header: m.annColTitle(),
      primary: true,
      cell: (row) => <ManagedTitle kind={kind} row={row} />,
    },
    kind === "announcement"
      ? {
          id: "urgency",
          header: m.annColUrgency(),
          cell: (row) => (
            <StatusText tone={URGENCY_TONE[row.urgency]}>
              {URGENCY_LABEL[row.urgency]()}
            </StatusText>
          ),
        }
      : {
          id: "where",
          header: m.newsColWhere(),
          cell: (row) =>
            row.visibility === "public"
              ? m.newsWherePublic()
              : m.newsSchoolOnly(),
        },
    {
      id: "when",
      header: m.annColWhen(),
      cell: (row) => (row.publishAt ? formatInstant(row.publishAt) : "–"),
    },
    { id: "reach", header: m.annColReach(), cell: (row) => reach(row) },
  ];
}

function managedCard(kind: BroadcastKind) {
  return {
    title: (row: ManagedRow) => <ManagedTitle kind={kind} row={row} />,
    fact: (row: ManagedRow) => reach(row),
  };
}

export interface ManagedBroadcastsProps {
  kind: BroadcastKind;
  tab: ManageTab;
  q: string;
  page: number;
  onPage: (page: number) => void;
}

/** The broadcasts of one kind those who manage it work through, on one tab. */
export function ManagedBroadcasts({
  kind,
  tab,
  q,
  page,
  onPage,
}: ManagedBroadcastsProps) {
  const data = useSuspenseQuery(
    kind === "announcement"
      ? managedAnnouncementsQuery({ tab, q, page })
      : managedNewsQuery({ tab, q, page }),
  ).data;
  const { rows } = data;
  return (
    <DataTable
      caption={
        kind === "announcement" ? m.annManagedCaption() : m.newsManagedCaption()
      }
      rows={rows}
      columns={managedColumns(kind)}
      rowLabel={(row) => titleOf(row)}
      card={managedCard(kind)}
      pagination={{
        page: data.page,
        pages: data.pages,
        total: data.total,
        pageSize: data.pageSize,
        onPage,
      }}
      empty={{
        icon: CircleCheck,
        title:
          kind === "announcement" ? m.annManagedEmpty() : m.newsManagedEmpty(),
        description:
          kind === "announcement"
            ? m.annManagedEmptyBody()
            : m.newsManagedEmptyBody(),
      }}
    />
  );
}
