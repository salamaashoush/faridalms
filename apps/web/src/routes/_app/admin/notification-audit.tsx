import type { DeliveryLogQuery } from "@faridalms/domain/notifications";
import type { Column } from "@faridalms/ui/system/data-table";
import type { Tone } from "@faridalms/ui/system/status";

import {
  DELIVERY_CHANNELS,
  DELIVERY_STATES,
  deliveryLogSchema,
} from "@faridalms/domain/notifications";
import { DataTable } from "@faridalms/ui/system/data-table";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Send } from "lucide-react";
import * as v from "valibot";

import type { deliveryLogQuery as Query } from "~/queries/notifications";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { deliveryLogQuery } from "~/queries/notifications";
import { formatInstant } from "~/utils/datetime";

const DEFAULT_SEARCH = v.parse(deliveryLogSchema, {});

export const Route = createFileRoute("/_app/admin/notification-audit")({
  staticData: { breadcrumb: m.ntfLogTitle },
  validateSearch: deliveryLogSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(deliveryLogQuery(deps)),
  component: DeliveryLogPage,
});

/** What a delivery was about: its notice's or conversation's title, or the sign-in link it carried. */
function aboutOf(row: Row) {
  if (row.kind === "invite") return m.ntfLinkInvite();
  if (row.kind === "reset") return m.ntfLinkReset();
  return row.title;
}

type Row = Awaited<
  ReturnType<NonNullable<ReturnType<typeof Query>["queryFn"]>>
>["rows"][number];

const STATE_LABEL: Record<Row["state"], () => string> = {
  pending: m.ntfStatePending,
  sent: m.ntfStateSent,
  failed: m.ntfStateFailed,
  skipped: m.ntfStateSkipped,
};

const STATE_TONE: Record<Row["state"], Tone> = {
  pending: "info",
  sent: "success",
  failed: "danger",
  skipped: "neutral",
};

const REASON_LABEL: Record<NonNullable<Row["reason"]>, () => string> = {
  preference_off: m.ntfReasonOff,
  no_address: m.ntfReasonNoAddress,
  unreachable: m.ntfReasonUnreachable,
  no_provider: m.ntfReasonNoProvider,
  withdrawn: m.ntfReasonWithdrawn,
  provider_error: m.ntfReasonError,
  gave_up: m.ntfReasonGaveUp,
};

const CHANNEL_LABEL: Record<Row["channel"], () => string> = {
  email: m.ntfEmail,
  sms: m.ntfSms,
};

interface StateProps {
  row: Row;
}

function State({ row }: StateProps) {
  return (
    <span className="grid gap-0.5">
      <StatusText tone={STATE_TONE[row.state]}>
        {STATE_LABEL[row.state]()}
      </StatusText>
      {row.reason ? (
        <span className="text-xs leading-4 text-muted-foreground">
          {REASON_LABEL[row.reason]()}
        </span>
      ) : null}
    </span>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function columns(): Column<Row>[] {
  return [
    {
      id: "person",
      header: m.annColPerson(),
      primary: true,
      cell: (row) => <bdi>{inLocale(row.fullNameEn, row.fullNameAr)}</bdi>,
    },
    {
      id: "about",
      header: m.ntfColAbout(),
      cell: (row) => <bdi className="truncate">{aboutOf(row) ?? "–"}</bdi>,
    },
    {
      id: "channel",
      header: m.ntfColChannel(),
      cell: (row) => CHANNEL_LABEL[row.channel](),
    },
    {
      id: "state",
      header: m.ntfColState(),
      cell: (row) => <State row={row} />,
    },
    {
      id: "when",
      header: m.ntfColWhen(),
      cell: (row) => formatInstant(row.sentAt ?? row.dueAt),
    },
  ];
}

const card = {
  title: (row: Row) => <bdi>{inLocale(row.fullNameEn, row.fullNameAr)}</bdi>,
  status: (row: Row) => <State row={row} />,
  fact: (row: Row) => `${CHANNEL_LABEL[row.channel]()} · ${aboutOf(row) ?? ""}`,
};

function DeliveryLogPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const data = useSuspenseQuery(deliveryLogQuery(search)).data;
  const update = (next: Partial<DeliveryLogQuery>) =>
    void navigate({
      search: (previous) => ({ ...previous, page: 1, ...next }),
    });
  return (
    <>
      <PageHeader
        title={m.ntfLogTitle()}
        count={data.total}
        description={m.ntfLogHint()}
      />
      <div className="grid gap-4">
        <IndexToolbar
          search={{
            value: search.q,
            onChange: (q) => update({ q }),
            label: m.ntfLogSearch(),
            placeholder: m.ntfLogSearchPlaceholder(),
          }}
          facets={[
            {
              id: "state",
              label: m.ntfColState(),
              single: true,
              defaultSelected: ["all"],
              selected: [search.state],
              options: [
                { value: "all", label: m.ntfAll() },
                ...DELIVERY_STATES.map((state) => ({
                  value: state,
                  label: STATE_LABEL[state](),
                })),
              ],
              onChange: ([state]) =>
                update({
                  state: (state ?? "all") as DeliveryLogQuery["state"],
                }),
            },
            {
              id: "channel",
              label: m.ntfColChannel(),
              single: true,
              defaultSelected: ["all"],
              selected: [search.channel],
              options: [
                { value: "all", label: m.ntfAll() },
                ...DELIVERY_CHANNELS.map((channel) => ({
                  value: channel,
                  label: CHANNEL_LABEL[channel](),
                })),
              ],
              onChange: ([channel]) =>
                update({
                  channel: (channel ?? "all") as DeliveryLogQuery["channel"],
                }),
            },
          ]}
          onReset={() => void navigate({ search: {} })}
        />
        <DataTable
          caption={m.ntfLogTitle()}
          rows={data.rows}
          columns={columns()}
          rowLabel={(row) => inLocale(row.fullNameEn, row.fullNameAr)}
          card={card}
          pagination={{
            page: data.page,
            pages: data.pages,
            total: data.total,
            pageSize: data.pageSize,
            onPage: (page) =>
              void navigate({ search: (previous) => ({ ...previous, page }) }),
          }}
          empty={{
            icon: Send,
            title: m.ntfLogEmpty(),
            description: m.ntfLogEmptyBody(),
          }}
        />
      </div>
    </>
  );
}
