import type { ManageTab, Urgency } from "@faridalms/domain/announcements";
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
import { formatDate, formatInstant, formatNumber } from "~/utils/datetime";

import { URGENCY_LABEL, URGENCY_TONE } from "./format";

type ManagedRow = Awaited<
  ReturnType<
    NonNullable<ReturnType<typeof managedAnnouncementsQuery>["queryFn"]>
  >
>["rows"][number];

const titleOf = (row: { titleEn: string; titleAr: string }) =>
  inLocale(row.titleEn || null, row.titleAr || null);

export interface AnnouncementItemProps {
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

/** One announcement as its readers' list shows it. */
export function AnnouncementItem({ item }: AnnouncementItemProps) {
  return (
    <li className="grid gap-1.5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {item.pinned ? (
          <Pin
            className="size-4 text-muted-foreground"
            aria-label={m.annPinned()}
          />
        ) : null}
        <Link
          to="/announcements/$announcementId"
          params={{ announcementId: item.id }}
          className={cn(
            "min-w-0 text-base leading-6 hover:text-primary hover:underline",
            item.unread ? "font-semibold" : "font-medium",
          )}
        >
          <bdi>{item.title}</bdi>
          {item.unread ? (
            <span className="sr-only"> {m.annUnread()}</span>
          ) : null}
        </Link>
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
          item.website ? m.annOnWebsite() : null,
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
  row: ManagedRow;
}

function ManagedTitle({ row }: ManagedTitleProps) {
  const title = titleOf(row);
  return row.state === "draft" ? (
    <RowLink to="/announcement-editor" search={{ id: row.id }}>
      {title}
    </RowLink>
  ) : (
    <RowLink
      to="/announcements/$announcementId"
      params={{ announcementId: row.id }}
    >
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
      id: "where",
      header: m.annColWhere(),
      cell: (row) =>
        row.visibility === "public" ? m.annWherePublic() : m.annWhereSchool(),
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

export interface ManagedAnnouncementsProps {
  tab: ManageTab;
  q: string;
  page: number;
  onPage: (page: number) => void;
}

/** The announcements those who manage them work through, on one tab. */
export function ManagedAnnouncements({
  tab,
  q,
  page,
  onPage,
}: ManagedAnnouncementsProps) {
  const data = useSuspenseQuery(
    managedAnnouncementsQuery({ tab, q, page }),
  ).data;
  return (
    <DataTable
      caption={m.annManagedCaption()}
      rows={data.rows}
      columns={managedColumns()}
      rowLabel={(row) => titleOf(row)}
      card={managedCard}
      pagination={{
        page: data.page,
        pages: data.pages,
        total: data.total,
        pageSize: data.pageSize,
        onPage,
      }}
      empty={{
        icon: CircleCheck,
        title: m.annManagedEmpty(),
        description: m.annManagedEmptyBody(),
      }}
    />
  );
}
