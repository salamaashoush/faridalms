import type {
  DeliveryState,
  NotificationChannel,
} from "@faridalms/domain/notification";

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import type { DataColumn } from "~/components/admin/DataTable";
import type { getNotificationAudit } from "~/server/notifications";

import { DataTable } from "~/components/admin/DataTable";
import { TableFilter } from "~/components/admin/TableFilter";
import {
  NOTIFICATION_TYPE_LABEL,
  notificationText,
} from "~/components/app/notification-labels";
import { PageHeader, Value } from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import * as m from "~/i18n/messages";
import { notificationAuditQuery } from "~/queries/notifications";
import { formatDateTime, formatNumber } from "~/utils/datetime";

const STATES = ["all", "pending", "sent", "failed", "skipped"] as const;
const CHANNELS = ["all", "in_app", "email", "sms"] as const;
type Row = Awaited<ReturnType<typeof getNotificationAudit>>["rows"][number];

export const STATE_LABEL: Record<DeliveryState, () => string> = {
  pending: m.deliveryPending,
  sent: m.deliverySent,
  failed: m.deliveryFailed,
  skipped: m.deliverySkipped,
};
export const CHANNEL_LABEL: Record<NotificationChannel, () => string> = {
  in_app: m.channelInApp,
  email: m.notifChannelEmail,
  sms: m.notifChannelSms,
};

const columns: DataColumn<Row, "created">[] = [
  {
    id: "created",
    label: m.messagesDate,
    sort: "created",
    render: (row) => (
      <span className="text-xs tabular-nums">
        {formatDateTime(row.createdAt.toISOString())}
      </span>
    ),
  },
  {
    id: "recipient",
    label: m.messagesRecipient,
    render: (row) => <Value>{row.notification.recipient.name}</Value>,
  },
  {
    id: "notification",
    label: m.notifTitle,
    render: (row) => (
      <div>
        <p className="text-sm font-medium">
          {
            notificationText(row.notification.type, row.notification.payload)
              .title
          }
        </p>
        <p className="text-xs text-muted-foreground">
          {NOTIFICATION_TYPE_LABEL[row.notification.type]()}
        </p>
      </div>
    ),
  },
  {
    id: "channel",
    label: m.notifChannels,
    render: (row) => (
      <span>
        {CHANNEL_LABEL[row.channel]()}
        {row.address ? (
          <span className="block text-xs text-muted-foreground">
            {row.address}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    id: "state",
    label: m.courseworkStatus,
    render: (row) => (
      <div className="space-y-1">
        <Badge
          variant={
            row.state === "sent"
              ? "default"
              : row.state === "failed"
                ? "destructive"
                : "outline"
          }
        >
          {STATE_LABEL[row.state]()}
        </Badge>
        <p className="text-xs text-muted-foreground">
          {m.deliveryAttempts({ count: formatNumber(row.attempts) })}
          {row.lastError ? ` · ${row.lastError}` : ""}
          {row.providerReceipt ? ` · ${row.providerReceipt}` : ""}
        </p>
      </div>
    ),
  },
];

export const Route = createFileRoute("/_app/admin/notification-audit")({
  staticData: { breadcrumb: m.notifAudit },
  validateSearch: v.object({
    page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    q: v.optional(v.string(), ""),
    state: v.optional(v.picklist(STATES), "all"),
    channel: v.optional(v.picklist(CHANNELS), "all"),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(notificationAuditQuery(deps)),
  component: AuditPage,
});

function AuditPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(notificationAuditQuery(search));
  const patch = (change: Partial<typeof search>) =>
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  return (
    <>
      <PageHeader title={m.notifAudit()} description={m.notifAuditHint()} />
      <DataTable
        rows={data.rows}
        columns={columns}
        caption={m.notifAudit()}
        query={search.q}
        onQuery={(q) => patch({ q, page: 1 })}
        sort="created"
        direction="desc"
        onSort={() => undefined}
        page={data.page}
        pages={data.pages}
        total={data.total}
        onPage={(page) => patch({ page })}
        filters={
          <>
            <TableFilter
              label={m.courseworkStatus()}
              value={search.state}
              classes={STATES.map((state) => ({
                id: state,
                name:
                  state === "all" ? m.courseworkAll() : STATE_LABEL[state](),
              }))}
              onChange={(value) => {
                const state = STATES.find((item) => item === value);
                if (state) patch({ state, page: 1 });
              }}
            />
            <TableFilter
              label={m.notifChannels()}
              value={search.channel}
              classes={CHANNELS.map((channel) => ({
                id: channel,
                name:
                  channel === "all"
                    ? m.courseworkAll()
                    : CHANNEL_LABEL[channel](),
              }))}
              onChange={(value) => {
                const channel = CHANNELS.find((item) => item === value);
                if (channel) patch({ channel, page: 1 });
              }}
            />
          </>
        }
      />
    </>
  );
}
